// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SymbolController } from './features/symbol/SymbolController';
import { SymbolWebviewProvider } from './features/symbol/SymbolWebviewProvider';
import { LspClient } from './shared/core/LspClient';
import { DatabaseManager } from './shared/core/DatabaseManager';
import { DisabledWebviewProvider } from './features/placeholder/DisabledWebviewProvider';

let globalDbManager: DatabaseManager | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('Symbol Window is active!');

    const lspClient = new LspClient();
    const dbManager = new DatabaseManager(context);
    globalDbManager = dbManager;

    const controller = new SymbolController(context, lspClient, dbManager);
    const provider = new SymbolWebviewProvider(context.extensionUri, controller);
    const provider2 = new SymbolWebviewProvider(context.extensionUri, controller, 'symbol-window-view-2');
    const disabledProvider = new DisabledWebviewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SymbolWebviewProvider.viewType, 
			provider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'symbol-window-view-2', 
			provider2,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	// Register second provider with controller
	controller.setProvider(provider2);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DisabledWebviewProvider.viewType, disabledProvider)
    );

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.refresh', () => {
			controller.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.toggleMode', () => {
			controller.toggleMode();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.deepSearch', () => {
			controller.deepSearch();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.deepSearchDisabled', async () => {
			const selection = await vscode.window.showInformationMessage(
				'Deep Search is currently disabled.',
				'Open Settings'
			);
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'symbolWindow.enableDeepSearch');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.searchInFolder', async (uri: vscode.Uri) => {
            if (uri && uri.fsPath) {
                // Focus the view
                await vscode.commands.executeCommand('symbol-window-view.focus');
                // Set scope
                controller.setScope(uri.fsPath);
            }
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.rebuildIndex', () => {
            if (dbManager.indexer) {
                // Default to Incremental
                dbManager.indexer.rebuildIndexIncremental();
            } else {
                vscode.window.showErrorMessage('Symbol Database is not available.');
            }
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.rebuildIndexFull', () => {
            if (dbManager.indexer) {
                dbManager.indexer.rebuildIndexFull();
            } else {
                vscode.window.showErrorMessage('Symbol Database is not available.');
            }
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.focusSearch', async () => {
			// Focus the Symbol Window view first
			await vscode.commands.executeCommand('symbol-window-view.focus');
			// Send message to webview to focus the search box
			controller.focusSearch();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.openSecondWindow', async () => {
			const currentState = context.globalState.get<boolean>('symbolWindow.showSecondView', false);
			const newState = !currentState;
			await context.globalState.update('symbolWindow.showSecondView', newState);
			await vscode.commands.executeCommand('setContext', 'symbolWindow.showSecondView', newState);
			
			if (newState) {
				vscode.window.showInformationMessage('Second Symbol Window opened. Check the sidebar.');
			} else {
				vscode.window.showInformationMessage('Second Symbol Window closed.');
			}
		})
	);

	// Initialize second window state
	const showSecondView = context.globalState.get<boolean>('symbolWindow.showSecondView', false);
	vscode.commands.executeCommand('setContext', 'symbolWindow.showSecondView', showSecondView);
}

export function deactivate() {
    if (globalDbManager) {
        globalDbManager.dispose();
        console.log('[SymbolWindow] Database closed.');
    }
}
