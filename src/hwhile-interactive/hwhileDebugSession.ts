import * as fs from 'fs';
import * as path from 'path';
import { HWhileReplConnector } from './hwhileReplConnector';

export interface HWhileLaunchConfiguration {
    file: string;
    input: string;
    printmode: string;
    hwhilePath: string;
    onOutput?: (output: string) => void;
    onMessage?: (output: string) => void;
    onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export class HWhileDebugSession {
    private repl?: HWhileReplConnector;
    private currentLine = 1;
    private currentSource: string;

    constructor(public readonly config: HWhileLaunchConfiguration) {
        this.currentSource = config.file;
    }

    private checkLocation(output?: string): boolean {
        if (!output) {
            return false;
        }

        const regex = /^(.+?), line ([0-9]+):$/gm;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(output)) !== null) {
            const programName = match[1].trim();
            const line = Number(match[2]);

            if (programName === '+IMPL+') {
                return true;
            }

            const candidatePath = path.join(path.dirname(this.config.file), `${programName}.while`);
            if (fs.existsSync(candidatePath)) {
                this.currentSource = candidatePath;
                this.currentLine = line;
                return false;
            }
        }

        return false;
    }

    private checkLoopExit(output?: string): boolean {
        if (!output) {
            return false;
        }

        const regex = /^\s?Skipped or exited while-loop.$/gm;

        return regex.exec(output) !== null;
    }

    private findAdjacentWords(path: string, word1: string, word2: string, findLast = false): number | undefined {
        if (!fs.existsSync(path)) {
            return undefined;
        };

        const text = fs.readFileSync(path, 'utf8');
        const matches: number[] = [];

        const regex = new RegExp(`(//.*)|(/\\*[\\s\\S]*?\\*/)|\\b(${word1})\\b|\\b(${word2})\\b`, 'g');
        let match: RegExpExecArray | null;
        let word1Index: number | null = null;

        while ((match = regex.exec(text)) !== null) {
            if (match[3]) {
                word1Index = match.index;
            } else if (match[4] && word1Index !== null) {
                matches.push(word1Index);
                word1Index = null;
            }
        }

        const finalIndex = findLast ? matches.pop() : matches[0];
        if (finalIndex === undefined) {
            return undefined;
        }

        const lineCount = text.slice(0, finalIndex).match(/\n/g)?.length || 0;
        return lineCount + 1;
    }

    private checkIO(output?: string): boolean {
        if (!output) {
            return false;
        }

        const regex = /^\s*(read|wrote) (.*?) = (.*)/gm;
        let match: RegExpExecArray | null;
        let stopProgram = false;

        while ((match = regex.exec(output)) !== null) {
            const keyword = match[1];
            const identifier = match[2];
            const value = match[3];
            const isWrite = keyword === 'wrote';

            const lineNumber = this.findAdjacentWords(this.config.file, isWrite ? 'write' : 'read', identifier);
            if (lineNumber !== undefined) {
                this.currentSource = this.config.file;
                this.currentLine = lineNumber;
            }

            if (isWrite) {
                this.config.onMessage?.(`Program output: ${value}\n`);
                stopProgram = true;
                break;
            }
        }

        return stopProgram;
    }

    private inspectProgramOutput(output?: string): { stepAgain: boolean; stopProgram: boolean } {
        return {
            stepAgain: this.checkLocation(output) || this.checkLoopExit(output),
            stopProgram: this.checkIO(output)
        };
    }

    private async checkProgramOutput(output?: string): Promise<boolean> {
        if (!this.repl) {
            return false;
        }

        let inspection = this.inspectProgramOutput(output);

        while (inspection.stepAgain && !inspection.stopProgram) {
            output = await this.repl.sendCommand(':step');
            inspection = this.inspectProgramOutput(output);
        }

        return inspection.stopProgram;
    }

    async launch(): Promise<void> {
        const cwd = path.dirname(this.config.file);
        this.repl = new HWhileReplConnector();
        this.repl.start({
            hwhilePath: this.config.hwhilePath,
            file: this.config.file,
            printmode: this.config.printmode,
            input: this.config.input,
            cwd,
            onOutput: this.config.onOutput,
            onExit: this.config.onExit
        });

        const startupOutput = await this.repl.readUntilPrompt();

        const baseFilename = path.basename(this.config.file, path.extname(this.config.file));
        await this.repl.sendCommand(`:load ${baseFilename} ${this.config.input}`);

        if (this.config.printmode && this.config.printmode !== '') {
            await this.repl.sendCommand(`:printmode ${this.config.printmode}`);
        }
    }

    private async executeCommand(command: string): Promise<boolean> {
        if (!this.repl) {
            return false;
        }

        const output = await this.repl.sendCommand(command);
        return await this.checkProgramOutput(output);
    }

    async continue(): Promise<boolean> {
        return this.executeCommand(':run');
    }

    async stepIn(): Promise<boolean> {
        return this.executeCommand(':step');
    }

    private breakpoints = new Map<string, Set<number>>();

    private normalizeSourcePath(source: string): string {
        return path.resolve(source);
    }

    private getProgramName(source: string): string {
        return path.basename(source, path.extname(source));
    }

    private isEmptyLine(source: string, line: number): boolean {
        if (!fs.existsSync(source)) {
            return false;
        }

        const contents = fs.readFileSync(source, 'utf8');
        const sourceLines = contents.split(/\r?\n/);
        return line > 0 && line <= sourceLines.length && sourceLines[line - 1].trim().length === 0;
    }

    async setBreakpoints(source: string, lines: number[]): Promise<Array<{ verified: boolean; line: number; message?: string }>> {
        if (!this.repl) {
            throw new Error('Debug session not started.');
        }

        const absolutePath = this.normalizeSourcePath(source);
        const programName = this.getProgramName(absolutePath);
        const existing = this.breakpoints.get(absolutePath) ?? new Set<number>();
        const requested = new Set(lines.filter((line) => Number.isInteger(line) && line > 0));

        const removed = Array.from(existing).filter((line) => !requested.has(line));
        const added = Array.from(requested).filter((line) => !existing.has(line));

        for (const line of removed) {
            await this.repl?.sendCommand(`:delbreak ${line} ${programName}`);
        }

        const results: Array<{ verified: boolean; line: number; message?: string }> = [];

        for (const line of added) {
            await this.repl?.sendCommand(`:break ${line} ${programName}`);
            const warning = this.isEmptyLine(absolutePath, line)
                ? `Breakpoint set on empty line ${line} in ${programName}.while. This is likely to be ignored by HWhile.`
                : undefined;
            results.push({ verified: true, line, message: warning });
        }

        for (const line of Array.from(requested).filter((line) => existing.has(line))) {
            results.push({ verified: true, line });
        }

        this.breakpoints.set(absolutePath, requested);
        return results.sort((a, b) => a.line - b.line);
    }

    async evaluate(expression: string, echoConsole: boolean = true): Promise<string | undefined> {
        const result = await this.repl?.sendCommand(expression, echoConsole);
        this.inspectProgramOutput(result);
        return result?.trim();
    }

    getThreads() {
        return [
            {
                id: 1,
                name: 'Main Thread'
            }
        ];
    }

    getStackFrames() {
        return [
            {
                id: 1,
                name: 'HWhile program',
                line: this.currentLine,
                column: 1,
                source: {
                    path: this.currentSource
                }
            }
        ];
    }

    private fileState: Array<{
        source: string;
        variables: Array<{ name: string; value: string }>;
        ref: number;
    }> = [];

    getScopes() {
        return [
            {
                name: 'Local',
                variablesReference: 1000
            }
        ];
    }

    private async fetchStoreState(): Promise<void> {
        const output = await this.repl?.sendCommand(':store', false);
        if (!output) {
            this.fileState = [];
            return;
        }

        const groups = new Map<string, Array<{ name: string; value: string }>>();
        const lines = output.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            const match = /^\(([^)]+)\)\s+([^=]+?)\s*=\s*(.*)$/.exec(trimmed);
            if (!match) {
                continue;
            }

            const source = match[1].trim();
            const variableName = match[2].trim();
            const variableValue = match[3].trim();

            if (!groups.has(source)) {
                groups.set(source, []);
            }

            groups.get(source)!.push({ name: variableName, value: variableValue });
        }

        let index = 0;
        this.fileState = Array.from(groups.entries()).map(([source, variables]) => ({
            source,
            variables,
            ref: 2000 + index++
        }));
    }

    async getVariables(variablesReference: number): Promise<any[]> {
        if (variablesReference === 1000) {
            await this.fetchStoreState();
            return this.fileState.map((group) => ({
                name: group.source,
                value: `${group.variables.length} variable${group.variables.length === 1 ? '' : 's'}`,
                variablesReference: group.ref
            }));
        }

        const group = this.fileState.find((item) => item.ref === variablesReference);
        if (!group) {
            return [];
        }

        return group.variables.map((variable) => ({
            name: variable.name,
            value: variable.value,
            variablesReference: 0
        }));
    }

    dispose(): void {
        this.repl?.dispose();
    }
}
