import * as vscode from 'vscode';
import * as helpers from '../helpers';

function getDefaultConfiguration() {
    const defaultConfiguration: vscode.DebugConfiguration = {
        type: 'hwhile',
        request: 'launch',
        name: 'HWhile: Debug File',
        file: '${file}',
        printmode: helpers.getDefaultPrintmode(),
        hwhilePath: ''
    };

    return defaultConfiguration;
};

export class HWhileDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): vscode.DebugConfiguration[] {
        return [getDefaultConfiguration()];
    }

    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.DebugConfiguration | undefined {
        const resolvedConfig: any = Object.keys(config || {}).length === 0
            ? { ...getDefaultConfiguration() }
            : { ...(config || {}) };

        resolvedConfig.type ??= 'hwhile';
        resolvedConfig.request ??= 'launch';
        resolvedConfig.name ??= 'HWhile: Run/Debug File';
        resolvedConfig.printmode ??= helpers.getDefaultPrintmode();
        resolvedConfig.hwhilePath ??= '';

        if (!resolvedConfig.file) {
            return undefined;
        }

        return resolvedConfig;
    }
}
