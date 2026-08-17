import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as helpers from './helpers';


let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('hwhile');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId === 'while') {
                await runUnparser(document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (document.languageId === helpers.LANGUAGE_ID) {
                runUnparser(document);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.languageId === helpers.LANGUAGE_ID) {
                runUnparser(editor.document);
            }
        })
    );

    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === helpers.LANGUAGE_ID) {
        runUnparser(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            diagnosticCollection.clear();
            if (event.affectsConfiguration('hwhile')) {
                if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === helpers.LANGUAGE_ID) {
                    runUnparser(vscode.window.activeTextEditor.document);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles((event) => {
            for (const fileUri of event.files) {
                diagnosticCollection.delete(fileUri);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        })
    );
}

async function runUnparser(document: vscode.TextDocument | undefined) {
    if (!document) {
        return;
    }

    if (!helpers.getHwhileEnableValidation()) {
        diagnosticCollection.clear();
        return;
    }

    const filePath = document.uri.fsPath;
    const currentDir = path.dirname(filePath);

    const hwhilePath = helpers.getHwhilePathQuiet();
    if (!hwhilePath) {
        diagnosticCollection.clear();
        return;
    }

    const args = ['-u', filePath];
    execFile(hwhilePath, args, (error, stdout, stderr) => {
        const output = stdout + stderr;
        if (!output) {
            return;
        }

        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();

        const errorRegex = /\b(Parse error: (?:(?:.*? )?'(.*?)'|(?!')(.*?)) in program\/macro '(.*?)', at line ([0-9]+), char ([0-9]+))\b/g;
        let match;

        while ((match = errorRegex.exec(output)) !== null) {
            const [, errorMessage, errorToken1, errorToken2, errorProgram, errorLineStr, errorColStr] = match;
            const errorToken = errorToken1 || errorToken2;
            
            const expectedFileName = `${errorProgram}.while`;
            const absolutePath = path.join(currentDir, expectedFileName);

            if (!fs.existsSync(absolutePath)) {
                return;
            };

            const fileUri = vscode.Uri.file(absolutePath);

            // Convert to zero-indexed line and column
            const errorLine = parseInt(errorLineStr, 10) - 1;
            const errorCol = parseInt(errorColStr, 10) - 1;

            const range = new vscode.Range(
                new vscode.Position(errorLine, errorCol),
                new vscode.Position(errorLine, errorCol + errorToken.length)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                errorMessage,
                vscode.DiagnosticSeverity.Error
            );

            const uriString = fileUri.toString();
            if (!diagnosticsMap.has(uriString)) {
                diagnosticsMap.set(uriString, []);
            }
            diagnosticsMap.get(uriString)!.push(diagnostic);
        }

        diagnosticCollection.delete(document.uri);
        
        diagnosticsMap.forEach((diagnostics, uriStr) => {
            const uri = vscode.Uri.parse(uriStr);
            diagnosticCollection.delete(uri);
            diagnosticCollection.set(uri, diagnostics);
        });
    });
}
