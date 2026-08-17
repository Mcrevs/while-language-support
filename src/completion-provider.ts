import * as vscode from 'vscode';
import path from 'path';
import { LANGUAGE_ID, getMaxParseSize } from './helpers';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        keywordCompletionProvider
    ));

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        OperatorCompletionProvider
    ));

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        atomCompletionProvider,
        "@"
    ));

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        variableCompletionProvider
    ));

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        macroCompletionProvider,
        "<"
    ));

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.uri.path.endsWith('.while')) {
            invalidate(document.uri);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidDeleteFiles((event) => {
        for (const uri of event.files) {
            if (uri.path.endsWith('.while')) {
                fileCache.delete(uri.toString());
            }
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidRenameFiles((event) => {
        for (const rename of event.files) {
            if (rename.oldUri.path.endsWith('.while')) {
                fileCache.delete(rename.oldUri.toString());
            }
        }
    }));

    const warmupCts = new vscode.CancellationTokenSource();
    context.subscriptions.push(warmupCts);
    void scanFiles(warmupCts.token).catch(() => {});
}

const macroVariableSortPrefix = "aa";
const variableSortPrefix = "bb";
const localMacroSortPrefix = "da";
const folderMacroSortPrefix = "db";
const externalMacroSortPrefix = "dd";
const constantSortPrefix = "ee";
const destructorSortPrefix = "ff";
const constructorSortPrefix = "gg";
const atomSortPrefix = "ff";
const keywordSortPrefix = "zy";
const operatorSortPrefix = "zz";

const keywordCompletionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        const items: vscode.CompletionItem[] = [];

        const constants = [
            { label: 'true', detail: 'Boolean true' },
            { label: 'false', detail: 'Boolean false' },
            { label: 'nil', detail: 'Empty tree' }
        ];

        constants.forEach(word => {
            const item = new vscode.CompletionItem(word.label, vscode.CompletionItemKind.Constant);
            item.detail = word.detail;
            item.insertText = word.label;
            item.sortText = `${constantSortPrefix}_${item.label}`;
            items.push(item);
        });

        const destructors = [
            { label: 'hd', detail: 'Head destructor' },
            { label: 'tl', detail: 'Tail destructor' },
        ];

        destructors.forEach(word => {
            const item = new vscode.CompletionItem(word.label, vscode.CompletionItemKind.Field);
            item.detail = word.detail;
            item.insertText = `${word.label} `;
            item.sortText = `${destructorSortPrefix}_${item.label}`;
            items.push(item);
        });

        const constructors = [
            { label: 'cons', detail: 'Tree constructor' },
        ];

        constructors.forEach(word => {
            const item = new vscode.CompletionItem(word.label, vscode.CompletionItemKind.Constructor);
            item.detail = word.detail;
            item.insertText = `${word.label} `;
            item.sortText = `${constructorSortPrefix}_${item.label}`;
            items.push(item);
        });

        const keywords = [
            { label: 'if', detail: 'Conditional if' },
            { label: 'else', detail: 'Conditional else' },
            { label: 'while', detail: 'Loop' },
            { label: 'switch', detail: 'Switch statement' },
            { label: 'case', detail: 'Switch statement case' },
            { label: 'default', detail: 'Switch statement default' }
        ];

        keywords.forEach(word => {
            const item = new vscode.CompletionItem(word.label, vscode.CompletionItemKind.Keyword);
            item.detail = word.detail;
            item.insertText = word.label;
            item.sortText = `${keywordSortPrefix}_${item.label}`;
            items.push(item);
        });

        return new vscode.CompletionList(
            items,
            false
        );
    }
};

const atomCompletionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        const items: vscode.CompletionItem[] = [];

        const lineText = document.lineAt(position).text;
        const replaceTrigger = position.character > 0 && lineText[position.character - 1] === '@';
        const range = replaceTrigger ? new vscode.Range(position.line, position.character - 1, position.line, position.character) : undefined;

        const atoms = [
            {
            "label": "@:=",
            "detail": "Assignment-operator atom"
            },
            {
            "label": "@asgn",
            "detail": "Assignment atom"
            },
            {
            "label": "@doAsgn",
            "detail": "Do-assignment atom"
            },
            {
            "label": "@while",
            "detail": "While atom"
            },
            {
            "label": "@doWhile",
            "detail": "Do-while atom"
            },
            {
            "label": "@if",
            "detail": "If atom"
            },
            {
            "label": "@doIf",
            "detail": "Do-if atom"
            },
            {
            "label": "@var",
            "detail": "Var atom"
            },
            {
            "label": "@quote",
            "detail": "Quote atom"
            },
            {
            "label": "@hd",
            "detail": "Head atom"
            },
            {
            "label": "@doHd",
            "detail": "Do-head atom"
            },
            {
            "label": "@tl",
            "detail": "Tail atom"
            },
            {
            "label": "@doTl",
            "detail": "Do-tail atom"
            },
            {
            "label": "@cons",
            "detail": "Construct atom"
            },
            {
            "label": "@doCons",
            "detail": "Do-construct atom"
            }
        ];

        atoms.forEach(atom => {
            const item = new vscode.CompletionItem(atom.label, vscode.CompletionItemKind.Constant);
            item.detail = atom.detail;
            item.insertText = atom.label;
            item.sortText = `${atomSortPrefix}_${item.label}`;
            if (range) {
                item.range = range;
            }
            items.push(item);
        });

        return new vscode.CompletionList(
            items,
            false
        );
    }
};

const OperatorCompletionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        const items: vscode.CompletionItem[] = [];

        const constants = [
            { label: ':=', detail: 'Assignment' },
            { label: '=', detail: 'Equality' },
        ];

        constants.forEach(word => {
            const item = new vscode.CompletionItem(word.label, vscode.CompletionItemKind.Operator);
            item.detail = word.detail;
            item.insertText = word.label;
            item.sortText = `${operatorSortPrefix}_${item.label}`;
            items.push(item);
        });

        return new vscode.CompletionList(
            items,
            false
        );
    }
};


const variableCompletionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        const cursorOffset = document.offsetAt(position);

        const text: string = document.getText();

        if (text.length > getMaxParseSize()) {
            return new vscode.CompletionList(
                [],
                true
            );
        }

        const macroRegex: RegExp = /([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)(?:\s|\/\/.*?\n|\(\*.*?\*\))*read(?:\s|\/\/.*?\n|\(\*.*?\*\))*([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)(?:\s|\/\/.*?\n|\(\*.*?\*\))*{(.*?)}(?:\s|\/\/.*?\n|\(\*.*?\*\))*write(?:\s|\/\/.*?\n|\(\*.*?\*\))*([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)/gms;
        const macros: Set<string> = new Set<string>();
        let inputVariable: string | undefined = undefined;
        let outputVariable: string | undefined = undefined;
        const variables: Set<string> = new Set<string>();

        let macroMatch: RegExpExecArray | null;

        while ((macroMatch = macroRegex.exec(text)) !== null) {
            const matchStart = macroMatch.index;
            const matchEnd = matchStart + macroMatch[0].length;
            
            if (cursorOffset >= matchStart && cursorOffset <= matchEnd) {
                const variableRegex: RegExp = /([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)(?:\s|\/\/.*?\n|\(\*.*?\*\))*:=/gms;

                inputVariable = macroMatch[2];
                outputVariable = macroMatch[4];
                
                const macroContents = macroMatch[3];
                let variableMatch: RegExpExecArray | null;
                while ((variableMatch = variableRegex.exec(macroContents)) !== null) {
                    variables.add(variableMatch[1]);
                }
            }
            else {
                macros.add(macroMatch[1]);
            }
        }

        const variableCompletions: vscode.CompletionItem[] = Array.from(variables).map(varName => {
            const item = new vscode.CompletionItem(varName, vscode.CompletionItemKind.Variable);
            item.detail = 'Local variable';
            item.sortText = `${variableSortPrefix}_${item.label}`;
            return item;
        });

        if (inputVariable) {
            const item = new vscode.CompletionItem(inputVariable, vscode.CompletionItemKind.Variable);
            item.detail = 'Program input';
            item.sortText = `${macroVariableSortPrefix}_${item.label}`;
            variableCompletions.push(item);
        }

        if (outputVariable) {
            const item = new vscode.CompletionItem(outputVariable, vscode.CompletionItemKind.Variable);
            item.detail = 'Program output';
            item.sortText = `${macroVariableSortPrefix}_${item.label}`;
            variableCompletions.push(item);
        }

        // const macroCompletions: vscode.CompletionItem[] = Array.from(macros).map(macroName => {
        //     const item = new vscode.CompletionItem(macroName, vscode.CompletionItemKind.Function);
        //     item.detail = 'Macro';
        //     item.sortText = `${localMacroSortPrefix}_${item.label}`;
        //     return item;
        // });

        return new vscode.CompletionList(
            // [...variableCompletions, ...macroCompletions],
            variableCompletions,
            false
        );
    }
};

const MACRO_REGEX = /([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)(?:\s|\/\/.*?\n|\(\*.*?\*\))*read(?:\s|\/\/.*?\n|\(\*.*?\*\))*([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)(?:\s|\/\/.*?\n|\(\*.*?\*\))*{(.*?)}(?:\s|\/\/.*?\n|\(\*.*?\*\))*write(?:\s|\/\/.*?\n|\(\*.*?\*\))*([a-zA-Z_\-$'][a-zA-Z0-9_\-$']*)/gms;

interface MacroInfo {
    name: string;
    inputVariable?: string;
    outputVariable?: string;
}

interface FileCacheEntry {
    uri: vscode.Uri;
    macros: MacroInfo[];
    invalid: boolean;
}

const fileCache = new Map<string, FileCacheEntry>();
const checkInProgress = new Set<string>();

function parseMacros(text: string): MacroInfo[] {
    const macros: MacroInfo[] = [];
    MACRO_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MACRO_REGEX.exec(text)) !== null) {
        macros.push({
            name: match[1],
            inputVariable: match[2],
            outputVariable: match[4]
        });
    }
    return macros;
}

function invalidate(uri: vscode.Uri): void {
    const entry = fileCache.get(uri.toString());
    if (entry) {
        entry.invalid = true;
    }
}

async function scanFiles(token: vscode.CancellationToken): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.while');

    for (const fileUri of files) {
        if (token.isCancellationRequested) {
            break;
        }

        const key = fileUri.toString();
        const entry = fileCache.get(key);
        if (entry && !entry.invalid) {
            continue;
        }
        if (checkInProgress.has(key)) {
            continue;
        }

        checkInProgress.add(key);
        try {
            const stats = await vscode.workspace.fs.stat(fileUri);
            if (stats.size > getMaxParseSize()) {
                // File too big to parse
                fileCache.set(key, { uri: fileUri, macros: [], invalid: false });
            } else {
                const bytes = await vscode.workspace.fs.readFile(fileUri);
                const text = Buffer.from(bytes).toString('utf8');
                fileCache.set(key, { uri: fileUri, macros: parseMacros(text), invalid: false });
            }
        } catch {
            fileCache.set(key, { uri: fileUri, macros: [], invalid: true });
        } finally {
            checkInProgress.delete(key);
        }
    }
}

function buildItems(document: vscode.TextDocument): vscode.CompletionItem[] {
    const documentKey = document.uri.toString();
    const documentDir = path.dirname(document.uri.fsPath);
    const best = new Map<string, vscode.CompletionItem>();

    for (const entry of fileCache.values()) {
        if (entry.invalid) {
            continue;
        }

        for (const macro of entry.macros) {
            let sortPrefix: string;
            let detail: string;
            if (entry.uri.toString() === documentKey) {
                sortPrefix = localMacroSortPrefix;
                detail = 'Local macro';
            } else if (path.dirname(entry.uri.fsPath) === documentDir) {
                sortPrefix = folderMacroSortPrefix;
                detail = 'Folder macro';
            } else {
                sortPrefix = externalMacroSortPrefix;
                detail = 'External macro';
            }

            const sortText = `${sortPrefix}_${macro.name}`;
            const existing = best.get(macro.name);
            if (existing && existing.sortText && existing.sortText <= sortText) {
                continue;
            }

            const item = new vscode.CompletionItem(macro.name, vscode.CompletionItemKind.Function);
            item.detail = detail;
            item.insertText = macro.name;
            item.sortText = sortText;

            const doc = new vscode.MarkdownString();
            if (macro.inputVariable) {
                doc.appendMarkdown(`**Input:** \`${macro.inputVariable}\`\n`);
            }
            if (macro.outputVariable) {
                doc.appendMarkdown(`**Output:** \`${macro.outputVariable}\`\n`);
            }
            doc.appendMarkdown(`**Source:** \`${vscode.workspace.asRelativePath(entry.uri, true)}\``);
            item.documentation = doc;

            best.set(macro.name, item);
        }
    }

    return Array.from(best.values());
}

const macroCompletionProvider: vscode.CompletionItemProvider = {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionList<vscode.CompletionItem>> {
        const items = buildItems(document);

        void scanFiles(token).catch(() => {});

        return new vscode.CompletionList(
            items,
            false
        );
    }
};
