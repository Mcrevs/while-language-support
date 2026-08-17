import * as path from 'path';
import * as vscode from 'vscode';
import * as helpers from '../helpers';
import { HWhileDebugSession } from './hwhileDebugSession';

interface DapRequest {
    type: 'request';
    seq: number;
    command: string;
    arguments?: any;
}

export class HWhileDebugAdapter implements vscode.DebugAdapter {
    private readonly _onDidSendMessage = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
    readonly onDidSendMessage = this._onDidSendMessage.event;
    private seq = 1;
    private debugSession: HWhileDebugSession | undefined;
    private terminated = false;
    private launchPromise: Promise<void> | undefined;
    private pendingBreakpoints = new Map<string, number[]>();

    handleMessage(message: any): void {
        if (message?.type !== 'request') {
            return;
        }

        const request = message as DapRequest;

        switch (request.command) {
            case 'initialize':
                this.sendResponse(request, true, {
                    supportsConfigurationDoneRequest: true,
                    supportsEvaluateForHovers: true,
                    supportsStepBack: false,
                    supportsRestartFrame: false,
                    supportsGotoTargetsRequest: false,
                    supportsStepInTargetsRequest: false,
                    supportsSetBreakpointsRequest: true,
                    supportsDataBreakpoints: false,
                    supportsCompletionsRequest: false,
                    supportsDelayedStackTraceLoading: false,
                    supportsTerminateRequest: false,
                    supportsTerminateThreadsRequest: false,
                    supportsSingleThreadExecutionRequests: false,
                    supportsCancelRequest: false
                });
                this.sendEvent('initialized');
                break;
            case 'launch':
                this.launchPromise = this.launch(request).catch((error) => {
                    this.sendResponse(request, false, undefined, String(error));
                });
                break;
            case 'configurationDone':
                this.sendResponse(request, true);
                break;
            case 'continue':
                this.continueExecution(request);
                break;
            case 'pause':
                this.sendResponse(request, false, undefined, 'Pause is not supported by HWhile interactive mode.');
                break;
            case 'next':
                this.sendResponse(request, false, undefined, 'Step over is not supported by HWhile interactive mode.');
                break;
            case 'stepIn':
                this.stepCommand(request);
                break;
            case 'stepOut':
                this.sendResponse(request, false, undefined, 'Step out is not supported by HWhile interactive mode.');
                break;
            case 'setBreakpoints':
                this.handleSetBreakpointsRequest(request);
                break;
            case 'threads':
                this.sendResponse(request, true, {
                    threads: this.debugSession?.getThreads() || []
                });
                break;
            case 'stackTrace':
                {
                    const stackFrames = this.debugSession?.getStackFrames() || [];
                    this.sendResponse(request, true, {
                        stackFrames,
                        totalFrames: stackFrames.length
                    });
                }
                break;
            case 'scopes':
                this.sendResponse(request, true, {
                    scopes: this.debugSession?.getScopes() || []
                });
                break;
            case 'variables':
                this.handleVariablesRequest(request);
                break;
            case 'evaluate':
                this.evaluateExpression(request);
                break;
            default:
                this.sendResponse(request, true, {});
                break;
        }
    }

    private send(message: vscode.DebugProtocolMessage): void {
        this._onDidSendMessage.fire(message);
    }

    private sendEvent(event: string, body?: any): void {
        this.send({
            type: 'event',
            seq: this.seq++,
            event,
            body: body || {}
        } as any);
    }

    private normalizeSourcePath(source: string): string {
        try {
            if (source.startsWith('file:')) {
                return vscode.Uri.parse(source).fsPath;
            }
            if (path.isAbsolute(source)) {
                return path.resolve(source);
            }
        } catch {}
        return source;
    }

    private sendBreakpointMessages(breakpoints: Array<{ message?: string }>): void {
        for (const bp of breakpoints) {
            if (bp.message) {
                this.sendEvent('output', {
                    category: 'stderr',
                    output: `${bp.message}\n`
                });
            }
        }
    }

    private terminateSession(outputMessage?: string): void {
        if (this.terminated) {
            return;
        }
        this.terminated = true;
        if (outputMessage) {
            this.sendEvent('output', {
                category: 'stderr',
                output: `${outputMessage}\n`
            });
        }
        this.sendEvent('terminated', { restart: false });
    }

    private sendStoppedEvent(reason: string): void {
        this.sendEvent('stopped', {
            reason,
            threadId: 1,
            allThreadsStopped: true
        });
    }

    private async handleSetBreakpointsRequest(request: DapRequest): Promise<void> {
        const args = request.arguments || {};
        const sourcePath = args.source?.path ?? args.source?.name;
        const lines: number[] = [];

        if (Array.isArray(args.breakpoints)) {
            for (const bp of args.breakpoints) {
                if (bp && Number.isInteger(bp.line)) {
                    lines.push(bp.line);
                }
            }
        }

        if (lines.length === 0 && Array.isArray(args.lines)) {
            for (const line of args.lines) {
                if (Number.isInteger(line)) {
                    lines.push(line);
                }
            }
        }

        if (!sourcePath) {
            this.sendResponse(request, false, undefined, 'No source path provided for breakpoints.');
            return;
        }

        const normalizedSource = this.normalizeSourcePath(sourcePath);

        const responseBreakpoints = lines.map((line) => ({ id: line, verified: true, line }));

        this.pendingBreakpoints.set(normalizedSource, lines);
        if (!this.debugSession && this.launchPromise) {
            await this.launchPromise;
        }

        if (this.debugSession) {
            try {
                const breakpoints = await this.debugSession.setBreakpoints(normalizedSource, lines);
                this.sendBreakpointMessages(breakpoints);
            } catch (error) {
                this.sendResponse(request, false, undefined, String(error));
                return;
            }
        }

        this.pendingBreakpoints.delete(normalizedSource);
        this.sendResponse(request, true, { breakpoints: responseBreakpoints });
    }

    private async handleVariablesRequest(request: DapRequest): Promise<void> {
        if (!this.debugSession) {
            this.sendResponse(request, false, undefined, 'Debug session not started.');
            return;
        }

        const reference = request.arguments?.variablesReference ?? 1000;
        try {
            const variables = await this.debugSession.getVariables(reference);
            this.sendResponse(request, true, { variables });
        } catch (error) {
            this.sendResponse(request, false, undefined, String(error));
        }
    }

    private sendResponse(request: DapRequest, success: boolean, body?: any, message?: string): void {
        this.send({
            type: 'response',
            seq: this.seq++,
            request_seq: request.seq,
            success,
            command: request.command,
            body: body || {},
            message
        } as any);
    }

    private async launch(request: DapRequest): Promise<void> {
        const args = request.arguments || {};
        const debugConfig = await helpers.validateHwhileConfiguration(
            args.file,
            args.hwhilePath,
            args.printmode,
            args.input,
            false
        );

        if (!debugConfig) {
            this.sendResponse(request, false, undefined, 'Invalid HWhile launch configuration.');
            return;
        }

        if (path.extname(debugConfig.file).toLowerCase() !== '.while') {
            this.sendResponse(request, false, undefined, 'HWhile interactive mode requires source files with the .while extension.');
            return;
        }

        this.debugSession = new HWhileDebugSession({
            file: debugConfig.file,
            input: debugConfig.input,
            printmode: debugConfig.printmode,
            hwhilePath: debugConfig.hwhilePath,
            onOutput: (output) => {
                if (output && output.trim().length > 0) {
                    this.sendEvent('output', {
                        category: 'stdout',
                        output
                    });
                }
            },
            onMessage: (output) => {
                if (output && output.trim().length > 0) {
                    this.sendEvent('output', {
                        category: 'console',
                        output: `\u001b[34m${output}\u001b[0m`
                    });
                }
            },
            onExit: (code, signal) => {
                this.terminateSession(code !== null ? `HWhile exited with code ${code}.` : 'HWhile process terminated.');
            }
        });

        await this.debugSession.launch();

        for (const [sourcePathKey, lines] of this.pendingBreakpoints.entries()) {
            if (lines.length === 0) {
                continue;
            }
            const sourcePath = this.normalizeSourcePath(sourcePathKey);
            try {
                const breakpoints = await this.debugSession.setBreakpoints(sourcePath, lines);
                this.sendBreakpointMessages(breakpoints);
            } catch (error) {
                this.sendEvent('output', {
                    category: 'stderr',
                    output: `Failed to set pending breakpoints for ${sourcePath}: ${String(error)}`
                });
            }
        }

        this.pendingBreakpoints.clear();
        this.sendResponse(request, true);
        this.sendStoppedEvent('entry');

        // Try to force the debug console to open
        await vscode.commands.executeCommand('workbench.debug.action.debug.focus');
        await vscode.commands.executeCommand('workbench.action.debug.reconnectConsole');
        await vscode.commands.executeCommand('workbench.panel.repl.view.focus');
    }

    private async continueExecution(request: DapRequest): Promise<void> {
        if (!this.debugSession) {
            this.sendResponse(request, false, undefined, 'Debug session not started.');
            return;
        }

        this.sendResponse(request, true, { allThreadsContinued: true });
        this.sendEvent('continued', {
            threadId: 1,
            allThreadsContinued: true
        });

        try {
            const stop = await this.debugSession.continue();
            if (stop) {
                this.terminateSession();
                return;
            }

            if (!this.terminated) {
                this.sendStoppedEvent('step');
            }
        } catch (error) {
            this.sendEvent('output', {
                category: 'stderr',
                output: `HWhile continue failed: ${String(error)}\n`
            });
        }
    }

    private async stepCommand(request: DapRequest): Promise<void> {
        if (!this.debugSession) {
            this.sendResponse(request, false, undefined, 'Debug session not started.');
            return;
        }

        const stop = await this.debugSession.stepIn();
        if (stop) {
            this.sendResponse(request, true, {});
            this.terminateSession();
            return;
        }

        this.sendResponse(request, true, {});
        this.sendStoppedEvent('step');
    }

    private async evaluateExpression(request: DapRequest): Promise<void> {
        if (!this.debugSession) {
            this.sendResponse(request, false, undefined, 'Debug session not started.');
            return;
        }

        const expression = request.arguments?.expression || '';
        const context = request.arguments?.context;

        const result = await this.debugSession.evaluate(expression, context === 'repl');
        this.sendResponse(request, true, {
            result: (context === 'repl') ? '' : result,
            variablesReference: 0
        });
    }

    dispose(): void {
        this.debugSession?.dispose();
    }
}

