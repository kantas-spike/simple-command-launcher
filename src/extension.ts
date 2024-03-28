type ExecutionType = "run" | "pickAndCode" | "pickAndOpen";

type Command = {
  name: string;
  path: string;
  executionType: ExecutionType;
  args: CmdArg[];
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

type PcikAndRunItem = {
  command: string;
  pickTitle: string;
  errMessage: string;
};

import * as util from "node:util";
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

function escapeQuote(input: string, quote = '"') {
  return input.replaceAll(quote, `\\${quote}`);
}

async function runCommand() {
  // 設定情報取得
  const config = vscode.workspace.getConfiguration("simple-command-launcher");
  const commandList = config.get<Command[]>("externalCommands");
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
  const args: string[] = [];
  for (let i = 0; i < selectedCmd.args.length; i++) {
    const arg = selectedCmd.args[i];
    const argName = arg.name ? arg.name : `引数${i + 1}`;
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
          return;
        }
        const value = choiceMap.get(selectedItem);
        if (!value) {
          vscode.window.showWarningMessage(
            `不正な項目(${selectedItem})が選択されました。設定を確認してください`
          );
          return;
        } else {
          args.push(value);
        }
      } else {
        const input = await vscode.window.showInputBox({
          title: `${argName}`,
          prompt: `${argName}を入力してください:`,
          value: arg.value,
        });
        if (!input) {
          vscode.window.showWarningMessage(`${arg.name}を入力してください`);
          return;
        }
        args.push(`"${escapeQuote(input)}"`);
      }
    } else {
      args.push(arg.value);
    }
  }
  // コマンドを実行
  const commandLine = `${selectedCmd.path} ${args.join(" ")}`;
  const asyncExecFile = util.promisify(execFile);
  const execCommand = async () => {
    try {
      commandOutputChannel.append(commandLine);
      const { stdout, stderr } = await asyncExecFile(selectedCmd.path, args, {
        shell: true,
      });
      // 実行結果出力
      vscode.window.showInformationMessage(`コマンド実行成功: ${commandLine}`);
      if (stdout) {
        commandOutputChannel.append(stdout);

        if (
          selectedCmd.executionType === "pickAndCode" ||
          selectedCmd.executionType === "pickAndOpen"
        ) {
          const item = pickAndXXMeta.get(selectedCmd.executionType);

          if (item === undefined) {
            throw Error(
              `不正なexecutionTypeが指定されました: ${selectedCmd.executionType}`
            );
          }

          const lines = stdout
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);
          const selectedValue = await vscode.window.showQuickPick(lines, {
            canPickMany: false,
            title: item.pickTitle,
          });

          if (!selectedValue) {
            vscode.window.showWarningMessage(item.errMessage);
            commandOutputChannel.append(item.errMessage);
            return;
          } else {
            execFile(
              item.command,
              [`"${escapeQuote(selectedValue)}"`],
              {
                shell: true,
              },
              (err, stdout, stderr) => {
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
        }
      }
      if (stderr) {
        commandOutputChannel.append(stderr);
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
  };
  execCommand();
}
