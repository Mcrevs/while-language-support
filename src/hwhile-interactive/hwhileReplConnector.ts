import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export interface HWhileReplConfig {
    hwhilePath: string;
    file: string;
    printmode: string;
    input: string;
    cwd: string;
    onOutput?: (output: string) => void;
    onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export class HWhileReplConnector {
    private process?: ChildProcessWithoutNullStreams;
    private buffer = '';
    private readonly prompt = 'HWhile>';
    private outputCallback?: (output: string) => void;
    private exitCallback?: (code: number | null, signal: NodeJS.Signals | null) => void;
    private pendingPromptResolve?: (output: string | undefined) => void;
    private echoOutput = true;

    start(config: HWhileReplConfig): void {
        const args: string[] = ['-r'];
        this.outputCallback = config.onOutput;
        this.exitCallback = config.onExit;

        this.process = spawn(config.hwhilePath, args, {
            cwd: config.cwd,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout.setEncoding('utf8');
        this.process.stderr.setEncoding('utf8');

        const handleOutput = (chunk: string) => {
            const output = chunk.toString();
            this.buffer += output;
            if (this.echoOutput) {
                this.outputCallback?.(output);
            }

            if (this.pendingPromptResolve) {
                const promptOutput = this.searchPrompt();
                if (promptOutput !== undefined) {
                    const resolve = this.pendingPromptResolve;
                    this.pendingPromptResolve = undefined;
                    resolve(promptOutput);
                }
            }
        };

        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);

        this.process.on('close', (code, signal) => {
            this.resolvePendingPrompt();
            this.exitCallback?.(code, signal);
        });

        this.process.on('error', (error) => {
            this.outputCallback?.(`HWhile process error: ${String(error)}\n`);
            this.resolvePendingPrompt();
            this.exitCallback?.(null, null);
        });
    }

    async sendCommand(command: string, echoConsole: boolean = true): Promise<string | undefined> {
        if (!this.process || !this.process.stdin.writable) {
            return undefined;
        }

        if (echoConsole) {
            this.outputCallback?.(`${command}\n`);
        }
        this.process.stdin.write(`${command}\n`);
        return this.readUntilPrompt(echoConsole);
    }

    async readUntilPrompt(echoConsole: boolean = true): Promise<string | undefined> {
        this.echoOutput = echoConsole;

        const initial = this.searchPrompt();
        if (initial !== undefined) {
            this.echoOutput = true;
            return initial;
        }

        return new Promise((resolve) => {
            this.pendingPromptResolve = resolve;
        });
    }

    private searchPrompt(): string | undefined {
        const index = this.buffer.indexOf(this.prompt);
        if (index >= 0) {
            const result = this.buffer.slice(0, index);
            this.buffer = this.buffer.slice(index + this.prompt.length);

            if (this.buffer.length > 0 && !this.echoOutput) {
                this.outputCallback?.(this.buffer);
            }
            this.echoOutput = true;

            return result;
        }
        return undefined;
    }

    private resolvePendingPrompt(output?: string): void {
        if (this.pendingPromptResolve) {
            const resolve = this.pendingPromptResolve;
            this.pendingPromptResolve = undefined;
            resolve(output);
        }
    }

    dispose(): void {
        this.resolvePendingPrompt();

        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
