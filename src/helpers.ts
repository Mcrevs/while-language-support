import * as vscode from 'vscode';
import * as path from 'path';

let extensionContext: vscode.ExtensionContext;

export const LANGUAGE_ID = "while";

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
};

export function getHwhileEnableValidation() {
    const config = vscode.workspace.getConfiguration('hwhile');
    const enableValidation = config.get<boolean>('validation', true);

    return enableValidation;
}

export function getDefaultPrintmode() {
    const config = vscode.workspace.getConfiguration('hwhile');
    let defaultPrintmode = config.get<string>('printmode');
    if (defaultPrintmode === undefined) {
        defaultPrintmode = "";
    }
    return defaultPrintmode;
}

export function getMaxParseSize() {
    const config = vscode.workspace.getConfiguration('while');
    const maxParseSizeKb = config.get<number>('maxParseSize', 8);

    return maxParseSizeKb * 1024;
}

export function getHwhileMissingPrompt() {
    const config = vscode.workspace.getConfiguration('hwhile');
    const promptIfMissing = config.get<boolean>('promptIfMissing', true);

    return promptIfMissing;
}

export function getHwhilePathQuiet(): string | undefined {
    const config = vscode.workspace.getConfiguration('hwhile');
    let hwhilePath = config.get<string>('executablePath');

    if (!hwhilePath || hwhilePath === "") {
        return undefined;
    }
    return hwhilePath;
}

export async function getHwhilePath(
    path_required: boolean,
    offer_dismiss: boolean
): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('hwhile');
    let hwhilePath = config.get<string>('executablePath');

    if (!hwhilePath || hwhilePath === "") {
        if (!path_required && !getHwhileMissingPrompt()) {
            // If the user said to not show again skip the ask check
            // Only do this when it is not required
            return undefined;
        }

        const openSettings = 'Open Settings';
        const browsePath = 'Browse Path';
        const dismiss = 'Dismiss';
        const dontShow = "Don't Show Again";

        const actions: Array<string> = [openSettings, browsePath];
        if (offer_dismiss) {
            actions.push(dismiss);
        }
        if (offer_dismiss && !path_required) {
            actions.push(dontShow);
        }

        let choice;
        if (path_required) {
            choice = await vscode.window.showErrorMessage(
                'Expected path to HWhile executable but nothing was provided.',
                ...actions
            );
        } else {
            choice = await vscode.window.showInformationMessage(
                "No path specified for HWhile. Would you like to configure one?",
                ...actions
            );
        }

        switch (choice) {
            case openSettings:
                vscode.commands.executeCommand('workbench.action.openSettings', 'hwhile.executablePath');
                break;
            case browsePath:
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    title: 'Select HWhile Executable'
                });

                if (fileUri && fileUri[0]) {
                    await vscode.workspace.getConfiguration('hwhile')
                        .update('executablePath', fileUri[0].fsPath, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`HWhile path saved: ${fileUri[0].fsPath}`);
                    hwhilePath = fileUri[0].fsPath;
                }
                break;
            case dontShow:
                await vscode.workspace.getConfiguration('hwhile')
                    .update('promptIfMissing', false, vscode.ConfigurationTarget.Global);
            default:
                break;
        }
    }

    if (!hwhilePath || hwhilePath === "") {
        return undefined;
    } else {
        return hwhilePath;
    }
}

export async function getProgramInput(filePath: string): Promise<string | undefined> {
    filePath = vscode.Uri.file(filePath).fsPath;

    const stateKey = `while:lastInput:${filePath}`;
    const lastInput = extensionContext.workspaceState.get<string>(stateKey) || '';

    const userInput = await vscode.window.showInputBox({
        prompt: `Enter program input for '${path.basename(filePath)}'`,
        value: lastInput,
        placeHolder: 'e.g. [1, 10]',
        ignoreFocusOut: true
    });

    if (userInput === undefined || userInput === "") {
        return undefined;
    }

    await extensionContext.workspaceState.update(stateKey, userInput);

    return userInput;
}

export async function validateHwhileConfiguration(
    file: string | undefined,
    hwhilePath: string | undefined,
    printmode: string | undefined,
    input: string | undefined,
    allowDebugPrintmodes: boolean = false
): Promise<{
    file: string;
    hwhilePath: string;
    printmode: string;
    input: string
} | undefined> {
    // Check a file was provided
    if (!file) {
        vscode.window.showErrorMessage("HWhile Configuration Error: The 'file' property is required.");
        return undefined;
    }

    // Check a path to HWhile was provided, if not check for it in the config
    if (!hwhilePath) {
        hwhilePath = await getHwhilePath(true, false);
    }
    if (!hwhilePath) {
        vscode.window.showErrorMessage("HWhile Configuration Error: Could not locate the hwhile executable.");
        return undefined;
    }

    // Check that the printmode is valid
    printmode = printmode || getDefaultPrintmode();
    const validPrintmodes = new Set(['', 'i', 'iv', 'l', 'li', 'liv', 'L', 'La']);
    if (allowDebugPrintmodes) {
        ['d', 'di', 'div', 'dl', 'dli', 'dliv', 'dL', 'dLa'].forEach(validPrintmodes.add, validPrintmodes);
    }
    if (!validPrintmodes.has(printmode)) {
        vscode.window.showErrorMessage(`HWhile Configuration Error: invalid printmode '${printmode}'.`);
        return undefined;
    }

    // Get the user input for this file
    input = (input && input.trim() !== "") ? input : undefined;
    if (!input) {
        input = await getProgramInput(file);
    }
    if (!input || input.trim() === "") {
        vscode.window.showErrorMessage("HWhile Configuration Error: Expected an input but nothing was provided.");
        return undefined;
    }

    return {
        file: file,
        hwhilePath: hwhilePath,
        printmode: printmode,
        input: input
    };
}