import * as vscode from 'vscode';
import { HWhileDebugConfigurationProvider } from './debugConfigurationProvider';
import { HWhileDebugAdapterDescriptorFactory } from './debugAdapterDescriptorFactory';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('hwhile', new HWhileDebugConfigurationProvider())
    );

    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(
            'hwhile',
            new HWhileDebugAdapterDescriptorFactory()
        )
    );
}
