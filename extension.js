// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs').promises;

const RESULT_FILE_NAME = 'schemasAutocompleteTemplate.json';

const readJson = async (path) => {
	try {
		const data = await fs.readFile(path, { encoding: 'utf8' });
		try {
			const parsed = JSON.parse(data);
			return parsed;
		} catch (error) {
			vscode.window.showErrorMessage('an error occured while parsing the file at ' + path + ' to json');
		}
	} catch (error) {
		vscode.window.showErrorMessage('an error occured while opening the file at ' + path);
	}
};

const readAllFiles = async (path, postFix, callback) => {
	//TODO: deal with errors
	const subfiles = await fs.readdir(path);
	const subSelectedFiles = subfiles.filter(name => name.endsWith(postFix));
	const subdirs = subfiles.filter(name => !name.includes('.'));
	await Promise.all([
		...subSelectedFiles.map(file => callback(path + '/' + file)),
		...subdirs.map(dir => readAllFiles(path+'/'+dir, postFix, callback))
	]);
};

const mergeJson = (json1, json2) => {
	const result = json1;
	Object.keys(json2).forEach(key => result[key] = result[key] !== undefined ? mergeJson(result[key], json2[key]): json2[key]);
	return result;
}

const processJson = (json) => {
	const result = {};
	if (json instanceof Object) {
		if (json instanceof Array) {
			console.log('array');
			result.array = {};
			result.array.value = json.map(item => processJson(item)).reduce((prev, curr) => mergeJson(prev, curr));
		} else {
			console.log('dict');
			result.obj = {};
			result.obj.value = {}; 
			Object.keys(json).forEach(key => {
				result.obj.value[key] = processJson(json[key]);
			});
		}
	} else {
		result[typeof json] = true;
	}
	console.log(result);
	return result;
}

const jsonRemoveSpaces = (text) => {
	let quotes = false;
	let result = '';

	for (let i = 0; i < text.length; i++) {
		if (text[i]==='"') {
			quotes=!quotes;
		} 

		if (text[i] !== ' ' || quotes) {
			result += text[i];
		}
	}

	return result;
};

const getWorkspacePath = () => {
	return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('jsonsuggestions is now active!');
	
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
	statusBarItem.command =  'jsonsuggestions.buildContextFile';

	context.subscriptions.push(statusBarItem);

	statusBarItem.text = `jsonSuggestions`;
    statusBarItem.tooltip = `build context file`;
    statusBarItem.show();

	const buildContextCommand = vscode.commands.registerCommand( 'jsonsuggestions.buildContextFile', () => {
		vscode.window.showInputBox({title:'enter the path of the release schemas or idea projects directory'}).then(async(input) => {
			if (input) {
				//vscode.window.showInformationMessage(input);
				//const PATH = 'X:/NewComputer/websites/vsExtensionTesting/test.json';
				// TODO: deal with multiple workspaces
				const workspacePath = getWorkspacePath();
				const path = workspacePath + '/' + input;
	
				const dir = await fs.readdir(path);
				const result = {};
				
				const projectsPath = dir.filter(subFile => !subFile.includes('.')).map(subFolder => path + '/' + subFolder);
				const projectsSubFolders = await Promise.all(projectsPath.map(async path => ({path, content:await fs.readdir(path)})));
				const filteredProjects = projectsSubFolders.filter(project => project.content.includes('schemas'));
				const subFilesPaths = (await Promise.all(filteredProjects.map(project => project.path + '/schemas')
					.map(async path => ({path, content:await fs.readdir(path)}))))
					.map(subdir => subdir.content.map(subsubdir => subdir.path + '/' + subsubdir))
					.reduce((prev, curr) => [...prev, ...curr],[]);


				await Promise.all(
					subFilesPaths
					.filter(subFile => !subFile.includes('.'))
					.map(path => {
						const typeDir = path.slice(path.lastIndexOf('/') + 1);
						result[typeDir] = {};
						return readAllFiles(path, '.json', async path => {
							const data = await readJson(path);
							result[typeDir] = mergeJson(result[typeDir], processJson(data));
						});
					})
				);

				console.log('---------result-------------');
				console.log(result);
				await fs.writeFile(workspacePath + "/" + RESULT_FILE_NAME, JSON.stringify(result));
				//const data = await readJson(path);
				//console.log(data);
			}
		});
		
	}); 

	context.subscriptions.push(buildContextCommand);
	
	const OPPOSITE = {
		'{':'}',
		'[':']',
	};

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
		'json', 
		{
			
		  async provideCompletionItems(document,position,token) {
			// pre editing the text
			let textUntilNow = document.getText()
				.split('\n')
				.filter((line, no) => no <= position.line)
				.map((line, no) => no < position.line ? line : line.slice(0, position.character))
				.join('');
			textUntilNow = jsonRemoveSpaces(textUntilNow);
			// scope calculation
			const scope = [];

			let label = undefined;
			let quotes = false;
			let afterColon = false;
			let afterColonText = undefined;
			for (let index = 0; index < textUntilNow.length; index ++) {
				if (textUntilNow[index]==='"') {
					quotes = !quotes;
				} else if (!quotes && textUntilNow[index] === ':') {
					afterColon = true;
				} else if (!quotes && textUntilNow[index] === ',') {
					label = undefined;
					afterColon = false;
					afterColonText = undefined;
				} else {
					if (!afterColon && quotes) {
						label = label? label + textUntilNow[index]: textUntilNow[index];
					} else {
						if (['{','['].includes(textUntilNow[index])) {
							scope.push({
								trigger:textUntilNow[index],
								label
							});
							label = undefined;
							afterColon = false;
							afterColonText = undefined;
						} else if (['}', ']'].includes(textUntilNow[index])) {
							if (OPPOSITE[scope[scope.length-1].trigger] !== textUntilNow[index]) {
								//TODO: add error
								console.log(scope[scope.length-1].trigger,textUntilNow[index]);
								return [];
							} else {
								scope.pop();
								label = undefined;
								afterColon = false;
								afterColonText = undefined;
							}
						} else {
							afterColonText = afterColonText ? afterColonText + textUntilNow[index] : textUntilNow[index];
						}
					}
				}
			}

			console.log(scope, label, afterColon, afterColonText);

			// template fetching
			const filePath = document.fileName;
			const schemas = '\\schemas\\';
			const afterSchemas = filePath.slice(filePath.indexOf(schemas) + schemas.length);
			const subDir = afterSchemas.slice(0, afterSchemas.indexOf('\\'));
			let autocompleteTemplate = await readJson(getWorkspacePath() + "/" + RESULT_FILE_NAME);
			autocompleteTemplate = autocompleteTemplate[subDir];
			
			// filtering by scope
			for (let i = 0; i < scope.length; i++) {
				if (scope[i].label) {
					autocompleteTemplate = autocompleteTemplate[scope[i].label];
				} 

				if ( scope[i].trigger==='[' ) {
					autocompleteTemplate = autocompleteTemplate.array.value;
				} else if (scope[i].trigger === '{' ) {
					autocompleteTemplate = autocompleteTemplate.obj.value;
				}
			}

			console.log(autocompleteTemplate);
			let completionOptions = [];
			const typesToOptions = (types) => {
				return types.map(type => {
					switch (type) {
						case 'string':
							return [{label:'""', detail: 'string'}];
						case 'array':
							return [{label:'[]', detail: 'array'}];
						case 'obj':
							return [{label:'{}', detail: 'object'}];
						case 'number':
							return [{label:123, detail: 'number'}];
						case 'boolean':
							return [{label:false, detail: 'boolean'}, {label:true, detail: 'boolean'}];
					}
				})
				.reduce((prev, curr) => [...prev, ...curr], []);
			}
			
			if (afterColon) {
				completionOptions = typesToOptions(Object.keys(autocompleteTemplate[label]));
			} else if (scope[scope.length - 1].trigger === '[') {
				completionOptions = typesToOptions(Object.keys(autocompleteTemplate));
			} else {
				completionOptions = Object.keys(autocompleteTemplate).map(key => ({label:`"${key}"`}));
			}
			
			// range setting
			let range;
			quotes = false;
			
			for (let i = 0; i < position.line; i++) {
				const line = document.lineAt(i);
				for (let j = 0; j < line.text.length; j ++) {
					if (line.text[j] === '"') {
						quotes = !quotes;
					}
				}
			}
			for (let j = 0; j < position.character; j++) {
				if (document.lineAt(position.line).text[j] === '"') {
					quotes = !quotes;
				}
			}
			
			if (quotes) {
				const line = document.lineAt(position.line).text;
				range = new vscode.Range(new vscode.Position(position.line, line.slice(0, position.character).lastIndexOf('"')),
					new vscode.Position(position.line, position.character + line.slice(position.character).indexOf('"') + 1))
			}// place the cursor inside the string if its

			console.log(completionOptions, range);

			return completionOptions.map(option => {
				const item = new vscode.CompletionItem(`${option.label}`, vscode.CompletionItemKind.Event);
				if (option.detail) {
					item.detail = option.detail;
				}
				
				if (range) {
					item.range = range;
				}

				return item;
			});
		  }
		},
		'{','[',':','\n',','
	  ));
	
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
