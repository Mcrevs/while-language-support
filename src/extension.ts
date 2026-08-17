import * as vscode from 'vscode';

import * as helpers from './helpers';
import * as hwhileTask from './hwhile-tasks';
import * as hwhileDiagnostic from './hwhile-diagnostic';
import * as hwhileInteractive from './hwhile-interactive';
import * as completionProvider from './completion-provider';

export async function activate(context: vscode.ExtensionContext) {
    helpers.activate(context);
    helpers.getHwhilePath(false, true);

    completionProvider.activate(context);

    
    hwhileDiagnostic.activate(context);
    
    hwhileTask.setup(context);
    hwhileInteractive.activate(context);

    console.log('WHILE Language Support is now active!');
}

export function deactivate() {}
