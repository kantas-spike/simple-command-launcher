type ExecutionType = "run" | "pickAndCode" | "pickAndOpen" | "inputsForTasks";

type Command = {
  name: string;
  path: string;
  executionType: ExecutionType;
  args: CmdArg[];
  // 実行結果の行をlabelとvalueに分割する区切り文字(未定義の場合は設定の既定値を採用)
  delimiter?: string;
};

type CmdArg = {
  name?: string;
  value: string;
  useInput: boolean;
  choices?: Choice[];
};

type Choice = {
  name?: string;
  value: string;
};

// simple-command-launcher.runCommandコマンドに渡す引数
type RunCommandArgs = {
  name?: string;
};

type PcikAndRunItem = {
  command: string;
  pickTitle: string;
  errMessage: string;
};

// 外部コマンドの実行結果の1行を表すQuickPickItem(inputsに渡す値を保持する)
type CommandResultItem = vscode.QuickPickItem & {
  value: string;
};

import * as util from "node:util";
import * as path from "node:path";
import { execFile } from "child_process";

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// 拡張機能用出力チャンネル
let commandOutputChannel: vscode.LogOutputChannel;

// 実行結果の行をlabelとvalueに分割する既定の区切り文字(設定で上書き可能)
const DEFAULT_ITEM_DELIMITER = "|";

// 引数の値で展開可能な事前定義変数(`${workspaceFolder}`など)
const VARIABLE_PATTERN = /\$\{(workspaceFolder|workspaceFolderBasename)\}/g;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "simple-command-launcher" is now active!'
  );

  // 出力チャンネルを初期化
  commandOutputChannel = vscode.window.createOutputChannel(
    "Simple Command Launcher",
    {
      log: true,
    }
  );
  commandOutputChannel.clear();

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  // tasks.jsonのinputs(`type: command`)からも呼び出せるため、戻り値をそのまま返却する
  let disposable = vscode.commands.registerCommand(
    "simple-command-launcher.runCommand",
    async (nameOrArgs?: string | RunCommandArgs) => runCommand(nameOrArgs)
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
  // 出力チャンネルを廃棄
  if (commandOutputChannel) {
    commandOutputChannel.dispose();
  }
}

function escapeQuote(input: string, quote = '"') {
  return input.replaceAll(quote, `\\${quote}`);
}

async function runCommand(
  nameOrArgs?: string | RunCommandArgs
): Promise<string | undefined> {
  // 設定情報取得
  const config = vscode.workspace.getConfiguration("simple-command-launcher");
  const commandList = loadExternalCommands();
  const openCommand = config.get<string>("openCommand");
  const vscodeCommand = config.get<string>("vscodeCommand");

  const pickAndXXMeta = new Map<"pickAndCode" | "pickAndOpen", PcikAndRunItem>([
    [
      "pickAndCode",
      {
        command: vscodeCommand ?? "code",
        pickTitle: "vscodeで開く",
        errMessage: "vscodeで開く項目を選択してください",
      },
    ],
    [
      "pickAndOpen",
      {
        command: openCommand ?? "open",
        pickTitle: "openで開く",
        errMessage: "openで開く項目を選択してください",
      },
    ],
  ]);

  if (!commandList || commandList.length === 0) {
    vscode.window.showErrorMessage(
      "設定で`externalCommands`にコマンドを追加してください。"
    );
    return undefined;
  }

  // console.log(commandList);
  const commandMap = commandList.reduce(
    (map: Map<string, Command>, cmd: Command) => {
      return map.set(cmd.name, cmd);
    },
    new Map<string, Command>()
  );

  // 外部コマンド名が指定された場合はquickPickでの選択を省略して以降の処理を行う
  const requestedName =
    typeof nameOrArgs === "string" ? nameOrArgs : nameOrArgs?.name;
  const selectedName = await selectCommandName(commandMap, requestedName);
  if (!selectedName) {
    return undefined;
  }

  const selectedCmd = commandMap.get(selectedName) as Command;

  // コマンドの引数を取得
  const args = await collectArgs(selectedCmd);
  if (!args) {
    return undefined;
  }

  return executeCommand(selectedCmd, args, pickAndXXMeta);
}

// 設定の各スコープ(user/workspace/workspace folder)からexternalCommandsを取得し、
// 後のスコープが優先されるようにname単位でマージする
// VS Code既定の配列の設定はスコープ単位で置き換えになるため、要素単位のマージは行えない
function loadExternalCommands(): Command[] {
  const inspected = vscode.workspace
    .getConfiguration("simple-command-launcher")
    .inspect<Command[]>("externalCommands");

  // 優先度が低い(user)順に並べる
  const scopedLists: (Command[] | undefined)[] = [
    inspected?.globalValue,
    inspected?.workspaceValue,
  ];

  // マルチルートワークスペースではフォルダごとに設定を持つため、folder分も追加する
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    scopedLists.push(
      vscode.workspace
        .getConfiguration("simple-command-launcher", folder.uri)
        .inspect<Command[]>("externalCommands")?.workspaceFolderValue
    );
  }

  return scopedLists.reduce<Command[]>(
    (merged, list) => mergeCommands(merged, list),
    []
  );
}

// nameをキーに外部コマンドをマージする(同一nameの場合は後のスコープの項目で上書き)
function mergeCommands(base: Command[], override?: Command[]): Command[] {
  const merged = new Map<string, Command>();
  for (const cmd of [...base, ...(override ?? [])]) {
    if (!cmd?.name) {
      continue;
    }
    merged.set(cmd.name, cmd);
  }
  return Array.from(merged.values());
}

// 実行する外部コマンドの名前を確定させる(未指定の場合はquickPickで選択させる)
async function selectCommandName(
  commandMap: Map<string, Command>,
  requestedName?: string
): Promise<string | undefined> {
  if (requestedName) {
    if (!commandMap.has(requestedName)) {
      const message = `未登録のコマンド名が指定されました: ${requestedName}`;
      vscode.window.showWarningMessage(message);
      commandOutputChannel.append(message);
      return undefined;
    }
    return requestedName;
  }

  // quickPick表示
  const selectedName = await vscode.window.showQuickPick(
    Array.from(commandMap.keys()),
    {
      canPickMany: false,
      title: "外部コマンドの選択",
    }
  );

  if (!selectedName) {
    vscode.window.showWarningMessage("コマンド名を選択してください");
    return undefined;
  }
  return selectedName;
}

// 外部コマンドに渡す引数を設定とユーザー入力から取得する(入力を中止した場合はundefined)
async function collectArgs(
  selectedCmd: Command
): Promise<string[] | undefined> {
  const cmdArgs = selectedCmd.args ?? [];
  const args: string[] = [];
  for (let i = 0; i < cmdArgs.length; i++) {
    const arg = cmdArgs[i];
    const argName = arg.name ? arg.name : `引数${i + 1}`;
    // valueは設定上省略可能なため、未指定の場合は空文字列として扱う
    const rawValue = arg.value ?? "";
    if (arg.useInput) {
      if (arg.choices) {
        const choiceMap = arg.choices.reduce(
          (map: Map<string, string>, choice: Choice) => {
            const key = choice.name ?? choice.value;
            map.set(key, choice.value);
            return map;
          },
          new Map<string, string>()
        );
        const name = arg.name ?? "項目";
        const selectedItem = await vscode.window.showQuickPick(
          Array.from(choiceMap.keys()),
          {
            canPickMany: false,
            title: `${name}を選択してください`,
          }
        );

        if (!selectedItem) {
          vscode.window.showWarningMessage(`${name}を選択してください`);
          return undefined;
        }
        const value = choiceMap.get(selectedItem);
        if (!value) {
          vscode.window.showWarningMessage(
            `不正な項目(${selectedItem})が選択されました。設定を確認してください`
          );
          return undefined;
        } else {
          const expanded = expandArgumentValue(value);
          if (expanded === undefined) {
            return undefined;
          }
          args.push(toCommandArgument(expanded, expanded !== value));
        }
      } else {
        // 初期値として事前定義変数を展開した値を表示する
        const defaultValue = expandArgumentValue(rawValue);
        if (defaultValue === undefined) {
          return undefined;
        }
        const input = await vscode.window.showInputBox({
          title: `${argName}`,
          prompt: `${argName}を入力してください:`,
          value: defaultValue,
        });
        if (!input) {
          vscode.window.showWarningMessage(`${arg.name}を入力してください`);
          return undefined;
        }
        const expanded = expandArgumentValue(input);
        if (expanded === undefined) {
          return undefined;
        }
        args.push(`"${escapeQuote(expanded)}"`);
      }
    } else {
      const expanded = expandArgumentValue(rawValue);
      if (expanded === undefined) {
        return undefined;
      }
      args.push(toCommandArgument(expanded, expanded !== rawValue));
    }
  }
  return args;
}

// 引数の値に含まれる事前定義変数を展開する
// 解決できない事前定義変数が含まれる場合は警告してundefinedを返す
function expandArgumentValue(value: string): string | undefined {
  if (!value.includes("${")) {
    return value;
  }

  const variables = collectPredefinedVariables();
  const unresolved: string[] = [];
  const expanded = value.replace(
    VARIABLE_PATTERN,
    (match: string, name: string) => {
      const resolved = variables.get(name);
      if (resolved === undefined) {
        unresolved.push(name);
        return match;
      }
      return resolved;
    }
  );

  if (unresolved.length > 0) {
    const names = Array.from(new Set(unresolved))
      .map((name) => `\${${name}}`)
      .join(", ");
    showWarning(
      `事前定義変数(${names})を解決できませんでした。ワークスペースが開かれているか確認してください。`
    );
    return undefined;
  }
  return expanded;
}

// 引数の値に展開可能な事前定義変数を格納する
// ワークスペースフォルダは、アクティブなエディタが属するフォルダを優先し、
// 取得できない場合は最初のワークスペースフォルダを採用する
function collectPredefinedVariables(): Map<string, string> {
  const variables = new Map<string, string>();
  const folder = activeWorkspaceFolder();
  if (folder) {
    variables.set("workspaceFolder", folder.uri.fsPath);
    variables.set("workspaceFolderBasename", path.basename(folder.uri.fsPath));
  }
  return variables;
}

// アクティブなエディタが属するワークスペースフォルダ(無ければ最初のワークスペースフォルダ)を返す
function activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }
  return vscode.workspace.workspaceFolders?.[0];
}

// 外部コマンドに渡す引数を生成する
// 事前定義変数の展開によって空白を含む値になった場合は、シェルで1つの引数として
// 扱われるようにクォートを付与する(設定側で既にクォートされている場合は付与しない)
function toCommandArgument(value: string, expanded: boolean): string {
  if (!expanded || !/\s/.test(value) || isQuoted(value)) {
    return value;
  }
  return `"${escapeQuote(value)}"`;
}

// 値全体が同じ種のクォートで囲まれているかどうかを返す
function isQuoted(value: string): boolean {
  return /^".*"$/s.test(value) || /^'.*'$/s.test(value);
}

// 警告メッセージをトーストと出力チャンネルに表示する
function showWarning(message: string): void {
  vscode.window.showWarningMessage(message);
  commandOutputChannel.append(message);
}

// 外部コマンドを実行し、executionTypeに応じて後続処理を行う
// executionTypeが`inputsForTasks`の場合はtasks.jsonのinputsに渡す値を返却する
async function executeCommand(
  selectedCmd: Command,
  args: string[],
  pickAndXXMeta: Map<"pickAndCode" | "pickAndOpen", PcikAndRunItem>
): Promise<string | undefined> {
  // コマンドを実行
  const commandLine = `${selectedCmd.path} ${args.join(" ")}`;
  const asyncExecFile = util.promisify(execFile);
  // tasks.jsonのinputsとして実行する場合は、成否のトースト表示を行わない
  const silent = selectedCmd.executionType === "inputsForTasks";

  try {
    commandOutputChannel.append(commandLine);
    const { stdout, stderr } = await asyncExecFile(selectedCmd.path, args, {
      shell: true,
    });
    // 実行結果出力
    if (!silent) {
      vscode.window.showInformationMessage(`コマンド実行成功: ${commandLine}`);
    }
    if (stdout) {
      commandOutputChannel.append(stdout);
    }
    if (stderr) {
      commandOutputChannel.append(stderr);
    }

    switch (selectedCmd.executionType) {
      case "pickAndCode":
      case "pickAndOpen":
        if (stdout) {
          await pickAndRun(selectedCmd.executionType, stdout, pickAndXXMeta);
        }
        break;
      case "inputsForTasks":
        return await pickTaskInput(stdout, resolveItemDelimiter(selectedCmd));
      default:
        break;
    }
  } catch (err) {
    if (err instanceof Error) {
      vscode.window.showErrorMessage(
        `コマンド実行失敗: ${err.message}\n${commandLine}`
      );
      commandOutputChannel.append(err.message);
    } else {
      commandOutputChannel.append(`不明なエラー発生: ${err}`);
    }
  }
  return undefined;
}

// 外部コマンドの実行結果から項目を選択させ、codeやopenで開く
async function pickAndRun(
  executionType: "pickAndCode" | "pickAndOpen",
  stdout: string,
  pickAndXXMeta: Map<"pickAndCode" | "pickAndOpen", PcikAndRunItem>
): Promise<void> {
  const item = pickAndXXMeta.get(executionType);
  if (item === undefined) {
    throw Error(`不正なexecutionTypeが指定されました: ${executionType}`);
  }

  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const selectedValue = await vscode.window.showQuickPick(lines, {
    canPickMany: false,
    title: item.pickTitle,
  });

  if (!selectedValue) {
    vscode.window.showWarningMessage(item.errMessage);
    commandOutputChannel.append(item.errMessage);
    return;
  }

  execFile(
    item.command,
    [`"${escapeQuote(selectedValue)}"`],
    {
      shell: true,
    },
    (err, stdout) => {
      const extraCmdLine = `${item.command} ${selectedValue}`;
      commandOutputChannel.append(extraCmdLine);
      if (err) {
        vscode.window.showInformationMessage(
          `コマンド実行失敗: ${extraCmdLine}`
        );
      } else {
        vscode.window.showInformationMessage(
          `コマンド実行成功:  ${extraCmdLine}`
        );
      }
    }
  );
}

// 外部コマンドの実行結果(STDOUT)の各行をQuickPickItemとして選択させ、
// tasks.jsonのinputsに渡す値として返却する
async function pickTaskInput(
  stdout: string,
  delimiter: string
): Promise<string | undefined> {
  const items = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map<CommandResultItem>((line) => parseItem(line, delimiter));

  if (items.length === 0) {
    const message =
      "外部コマンドの実行結果(STDOUT)に選択できる項目がありません。";
    vscode.window.showWarningMessage(message);
    commandOutputChannel.append(message);
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: false,
    title: "tasks.jsonのinputsに渡す値の選択",
  });

  if (!selected) {
    const message = "inputsに渡す値を選択してください";
    vscode.window.showWarningMessage(message);
    commandOutputChannel.append(message);
    return undefined;
  }
  commandOutputChannel.append(`inputsに渡す値: ${selected.value}`);
  return selected.value;
}

// 実行結果の1行(`label<区切り文字>value`)をQuickPickItemに変換する
// 区切り文字が存在しない場合はlabelとvalueに同じ値を使用する
function parseItem(line: string, delimiter: string): CommandResultItem {
  const index = line.indexOf(delimiter);
  const rawLabel = index < 0 ? line : line.slice(0, index);
  const rawValue = index < 0 ? line : line.slice(index + delimiter.length);
  const label = rawLabel.trim();
  const value = rawValue.trim();

  // どちらかが空の場合は、もう一方の値を代わりに使用する
  const item: CommandResultItem = {
    label: label.length > 0 ? label : value,
    value: value.length > 0 ? value : label,
  };
  // 選択時にinputsへ渡される値が分かるようにvalueを説明として表示する
  if (item.label !== item.value) {
    item.description = item.value;
  }
  return item;
}

// 実行結果の行を分割する区切り文字を解決する
// Commandに指定がない場合は、設定の既定の区切り文字を採用する
function resolveItemDelimiter(selectedCmd: Command): string {
  const config = vscode.workspace.getConfiguration("simple-command-launcher");
  return (
    selectedCmd.delimiter ||
    config.get<string>("defaultDelimiter") ||
    DEFAULT_ITEM_DELIMITER
  );
}
