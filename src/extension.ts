type Command = {
  name: string;
  path: string;
  args: CmdArg[];
};

type CmdArg = {
  name?: string;
  value: string;
  useInput: boolean;
};

import { execFile } from "child_process";

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// 拡張機能用出力チャンネル
let commandOutputChannel: vscode.LogOutputChannel;

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
  let disposable = vscode.commands.registerCommand(
    "simple-command-launcher.runCommand",
    () => {
      runCommand();
    }
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

async function runCommand() {
  // 設定情報取得
  const config = vscode.workspace.getConfiguration("simple-command-launcher");
  const commandList = config.get<Command[]>("externalCommands");

  if (!commandList || commandList.length === 0) {
    vscode.window.showErrorMessage(
      "設定で`externalCommands`にコマンドを追加してください。"
    );
    return;
  }

  // console.log(commandList);
  const commandMap = commandList.reduce(
    (map: Map<string, Command>, cmd: Command) => {
      return map.set(cmd.name, cmd);
    },
    new Map<string, Command>()
  );

  // quickPick表示
  commandMap.keys();
  const selectedName = await vscode.window.showQuickPick(
    Array.from(commandMap.keys()),
    {
      canPickMany: false,
      title: "外部コマンドの選択",
    }
  );

  if (!selectedName) {
    vscode.window.showWarningMessage("コマンド名を選択してください");
    return;
  }

  const selectedCmd = commandMap.get(selectedName) as Command;
  if (!selectedCmd.args) {
    selectedCmd.args = [];
  }
  // コマンドの引数を取得
  const args = [];
  for (let i = 0; i < selectedCmd.args.length; i++) {
    const arg = selectedCmd.args[i];
    const argName = arg.name ? arg.name : `引数${i + 1}`;
    if (arg.useInput) {
      const input = await vscode.window.showInputBox({
        title: `${argName}`,
        prompt: `${argName}を入力してください:`,
        value: arg.value,
      });
      if (!input) {
        vscode.window.showWarningMessage(`${arg.name}を入力してください`);
        return;
      }
      args.push(input);
    } else {
      args.push(arg.value);
    }
  }
  // コマンドを実行
  const commandLine = `${selectedCmd.path} ${args.join(" ")}`;
  execFile(selectedCmd.path, args, { shell: true }, (err, stdout, stderr) => {
    if (err) {
      commandOutputChannel.append(err.message);
      if (stderr) {
        commandOutputChannel.append(stderr);
      }
    }
    if (stdout) {
      commandOutputChannel.append(stdout);
    }
  });

  // 実行結果出力
  vscode.window.showInformationMessage(`コマンドを実行: ${commandLine}`);
}
