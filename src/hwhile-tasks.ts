import * as vscode from 'vscode';

import * as helpers from './helpers';

const hwhileTaskType = 'hwhile';

export function setup(context: vscode.ExtensionContext) {
    vscode.tasks.registerTaskProvider(hwhileTaskType, {
        async provideTasks(token?: vscode.CancellationToken): Promise<vscode.Task[]> {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return [];
            }

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);

            const task = await createRunOpenFileTask(workspaceFolder);

            return task ? [task] : [];
        },

        async resolveTask(task: vscode.Task, token?: vscode.CancellationToken): Promise<vscode.Task | undefined> {
            const definition = task.definition;

            let workspaceFolder: vscode.WorkspaceFolder | undefined;
            if (task.scope && typeof task.scope !== 'number') {
                workspaceFolder = task.scope as vscode.WorkspaceFolder;
            }

            return await createValidateTask(definition, workspaceFolder, task.name);
        }
    });

    let disposable = vscode.commands.registerCommand('while-language-support.runOpenFileHWhile', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        const workspaceFolder = activeEditor ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri) : undefined;
        
        const task = await createRunOpenFileTask(workspaceFolder);
        if (task) {
            await vscode.tasks.executeTask(task);
        } else {
            await vscode.window.showErrorMessage("Error while creating HWhile task.");
        }
    });
    context.subscriptions.push(disposable);
}

async function createRunOpenFileTask(workspaceFolder: vscode.WorkspaceFolder | undefined): Promise<vscode.Task | undefined> {
    // const currentFile = vscode.workspace.asRelativePath(activeEditor.document.uri);
    const currentFile = "${file}";

    const taskDefinition: vscode.TaskDefinition = {
        type: hwhileTaskType,
        file: currentFile,
        printmode: helpers.getDefaultPrintmode(),
        hwhilePath: ""
    };

    const task = await createValidateTask(taskDefinition, workspaceFolder, "Run Open File");
    if (task) {
        task.detail = "Run the currently open file in HWhile";
    }
    return task;
}

async function validateDefinition(definition: vscode.TaskDefinition): Promise<boolean> {
    const validConfig = await helpers.validateHwhileConfiguration(
        definition.file,
        definition.hwhilePath,
        definition.printmode,
        definition.input,
        true
    );

    if (!validConfig) {
        return false;
    }

    definition.file = validConfig.file;
    definition.hwhilePath = validConfig.hwhilePath;
    definition.printmode = validConfig.printmode;
    definition.input = validConfig.input;

    return true;
}

async function createValidateTask(
    definition: vscode.TaskDefinition, 
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    taskName: string
): Promise<vscode.Task | undefined> {
    const execution = new vscode.CustomExecution(async (resolvedDefinition: vscode.TaskDefinition) => {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number>();

        return {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: async () => {
                
                // Validate task input
                writeEmitter.fire('Validating HWhile configuration...\r\n');
                if (!await validateDefinition(resolvedDefinition)) {
                    writeEmitter.fire('Error in HWhile configuration!\r\n\n');
                    closeEmitter.fire(1);
                    return undefined;
                };
                
                // Run HWhile
                writeEmitter.fire('Setting up HWhile...\r\n');

                const task = await createExecuteTask(resolvedDefinition, workspaceFolder, taskName);
                if (!task) {
                    writeEmitter.fire('Error while starting HWhile!\r\n\n');
                    closeEmitter.fire(1);
                    return undefined;
                }
                writeEmitter.fire('Starting HWhile!\r\n\n\n');

                await vscode.tasks.executeTask(task);
                closeEmitter.fire(0);
            },
            close: () => {}
        } as vscode.Pseudoterminal;
    });

    const taskScope = workspaceFolder || vscode.TaskScope.Global;

    const task = new vscode.Task(
        definition,
        taskScope,
        taskName,
        "HWhile",
        execution,
        []
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        focus: true
    };

    return task;
}

async function createExecuteTask(
    definition: vscode.TaskDefinition, 
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    taskName: string
): Promise<vscode.Task | undefined> {
    const args = [];
    if (definition.printmode) {
        args.push(`-${definition.printmode}`);
    }
    args.push(definition.file, definition.input);

    const execution = new vscode.ProcessExecution(definition.hwhilePath, args);

    let modifiedDefinition = structuredClone(definition);

    const taskScope = workspaceFolder || vscode.TaskScope.Global;

    const task = new vscode.Task(
        modifiedDefinition,
        taskScope,
        taskName,
        "HWhileProcessExecution",
        execution,
    );

    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        focus: true
    };

    task.detail = "Run the currently open file in HWhile directly. This has no validation so it is not recommended to use this task directly.";

    return task;
}