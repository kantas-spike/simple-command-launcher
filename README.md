# simple-command-launcher

設定情報に登録したシェルスクリプトなどの外部コマンドを実行するためのvscode拡張機能

## インストール方法

以下を実行してパッケージを作成してください。

```shell
npm install
npm run package
```

`simple-command-launcher-x.x.x.vsix`というファイルが作成されるので、以下を実行して拡張機能をインストールしてください。[^1]

```shell
code --install-extension simple-command-launcher-x.x.x.vsix
```

## 使い方

### 準備

まず、`simple-command-launcher`の設定で`External Commands`に外部コマンドを追加する必要があります。

外部コマンドの追加は、設定画面の`External Commands`で、`settings.json で編集`をクリックし、JSONファイルを編集して行います。

今回は、例として`echo`コマンドを外部コマンドに登録しましょう。

```json
// ..略..
"simple-command-launcher.externalCommands": [
    {
      "name": "echo", // quick pickに表示される項目名
      "path": "echo",
      "args": [
        {
          "value": "hello" // 第1引数
        },
        {
          "value": "world", // 第2引数
          "useInput": true  // quick inputで修正可能
        }
      ]
    }
  ]
// ..略..
```

外部コマンドの設定方法の詳細は、[Extension Settings](#extension-settings)を参照してください。

### コマンド実行

実行手順は以下になります。

1. コマンドパレットから`Simple Command Launcher: Run`を選択します。
2. 登録済の外部コマンドの名前が一覧表示されるので、実行したい名前を選択します。
3. (設定に応じて)コマンド引数のユーザー入力が求められます。必要に応じて引数を編集してEnterを押します。
4. 全ての引数の入力が終われば外部コマンドが実行されます。

### tasks.jsonの`inputs`として利用する

vscodeの`tasks.json`に定義する`inputs`(`type: command`)から、`simple-command-launcher.runCommand`を呼び出すことができます。
引数に外部コマンド名(`name`)を指定した場合は、コマンド一覧からの選択(quickPick)を省略して、そのコマンドが選択された状態で以降の処理を行います。

`executionType`に`inputsForTasks`を設定した外部コマンドでは、実行結果(`STDOUT`)の各行がQuickPickの選択肢として表示され、選択した値が`inputs`の値(変数)としてタスクに渡されます。

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "deploy",
      "type": "shell",
      "command": "echo deploying to ${input:target}",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "target",
      "type": "command",
      "command": "simple-command-launcher.runCommand",
      "args": {
        "name": "list name" // simple-command-launcherの設定で登録した外部コマンド名
      }
    }
  ]
}
```

対応する`externalCommands`の設定は以下になります。

```json
// ..略..
"simple-command-launcher.externalCommands": [
    {
      "name": "list name", // tasks.jsonのargs.nameに指定する名前
      "path": "/bin/ls",
      "executionType": "inputsForTasks", // 実行結果(STDOUT)をinputsに返す
      "delimiter": "|", // 任意。省略時はsimple-command-launcher.defaultDelimiterの値を採用
      "args": [{ "value": "-dr" }, { "value": "~/hacking/spike/*" }]
    }
  ]
// ..略..
```

`executionType`に`inputsForTasks`を指定した場合、外部コマンドの実行結果(`STDOUT`)の各行は以下のフォーマットを利用できます。

```text
label|value
```

QuickPickには`label`が表示され(`value`は説明文として併記されます)、選択した項目の`value`が`inputs`の値(変数)としてタスクに渡されます。

行を分割する区切り文字の既定値は`|`で、拡張機能共通の既定値は`simple-command-launcher.defaultDelimiter`で変更できます。また、コマンド情報に`delimiter`を指定すると、そのコマンドだけの区切り文字を優先できます(`delimiter`が未定義の場合は`defaultDelimiter`の値を採用)。

分割のルールは以下になります。

- 最初に見つかった区切り文字の直前までを`label`、以降を`value`とみなします(`value`に区切り文字を含めることができます)。
- 区切り文字が存在しない場合は、行全体を`label`と`value`の両方に使用します。
- `label`または`value`が空になる場合は、もう一方の値を代わりに使用します。
- いずれも前後の空白は除去されます。

区切り文字に`,`を指定した場合の例は以下になります。

| 外部コマンドの出力   | QuickPickの表示 | inputsに渡される値 |
| -------------------- | --------------- | ------------------ |
| `staging,192.0.2.10` | `staging`       | `192.0.2.10`       |
| `prod,192.0.2.20`    | `prod`          | `192.0.2.20`       |
| `localhost`          | `localhost`     | `localhost`        |
| `staging,`           | `staging`       | `staging`          |

`args`の挙動は以下になります。

- `name`を省略した場合は、コマンドパレットから実行した場合と同じく、コマンド一覧を選択するquickPickが表示されます。
- `args`に配列を指定した場合は、先頭の要素が外部コマンド名として扱われます(`"args": ["list name"]`)。
- 指定した`name`が設定の`externalCommands`に存在しない場合は、警告を表示して処理を終了します。
- 選択をキャンセルした場合や外部コマンドの実行に失敗した場合は値を返さないため、タスクは実行されません。

## Features

- **設定情報**に複数の外部コマンドを登録可能
- 登録したコマンドをvscodeのコマンドとして呼び出し可能
- コマンドの実行結果は`出力`-`Simple Command Launcher`に出力
- `runCommand`コマンドに外部コマンド名を渡すと、コマンド一覧の選択を省略できる
- 外部コマンドの実行結果(`STDOUT`)を`tasks.json`の`inputs`(変数)として利用できる
- `inputsForTasks`では実行結果の各行を`label|value`形式で定義でき、選択した`value`をタスクに渡せる
- 引数の値(`args[].value`)に事前定義変数(`${workspaceFolder}`など)を指定でき、コマンド実行時に展開される

## Requirements

- [@vscode/vsce](https://github.com/microsoft/vscode-vsce)

## Extension Settings

`simple-command-launcher.externalCommands`には、**コマンド情報**を配列として設定できます。

**コマンド情報**に設定できる内容は以下になります。

| コマンド情報の項目 | 省略可否 | デフォルト値             | 説明                                                                                                                                                                                                                                                                                          |
| ------------------ | -------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name               | 不可     | -                        | 外部コマンド名。 `Simple Command Launcher`の`Run`コマンド実行時の選択項目になる。                                                                                                                                                                                                             |
| path               | 不可     | -                        | 外部コマンドのパス。`/bin/sh`により実行されるコマンドのパス                                                                                                                                                                                                                                   |
| executionType      | 可       | run                      | `run`(外部コマンドを実行), `pickAndCode`(外部コマンドの実行結果をQuickPickで選択し、VsCodeで開く), `pickAndOpen`(外部コマンドの実行結果をQuickPickで選択し、Openで開く), `inputsForTasks`(外部コマンドの実行結果をQuickPickで選択し、`tasks.json`の`inputs`に値を渡す) のいずれかを選択可能。 |
| delimiter          | 可       | 設定の`defaultDelimiter` | `executionType`が`inputsForTasks`のときに、実行結果(`STDOUT`)の各行を`label`と`value`に分割する区切り文字。省略時は`simple-command-launcher.defaultDelimiter`の値を採用。                                                                                                                     |
| args               | 可       | []                       | 外部コマンドに渡す**引数情報**の配列                                                                                                                                                                                                                                                          |

**引数情報**に設定できる項目は以下になります。

| 引数情報の項目 | 省略可否 | 型           | デフォルト値 | 説明                                                                                                                                                                           |
| -------------- | -------- | ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| name           | 可       | string       | `引数n`      | 引数名。省略時は、`引数n`となる。(nは引数の番号)                                                                                                                               |
| value          | 可       | string       | `""`         | 引数の値。事前定義変数(`${workspaceFolder}`など)を含めることができる(詳細は[事前定義変数](#事前定義変数)を参照)                                                                |
| useInput       | 可       | boolean      | false        | ユーザー入力の受付有無 。`true`の場合、ユーザー入力から引数を編集できる。その際、`value`の値が初期値として表示される。`false`の場合、`value`の値がそのまま引数として使用される |
| choices        | 可       | **Choice**[] | undefined    | ユーザー入力受付時(`useInputがtrue時`)に、choicesが指定された場合、指定した選択肢を表示する                                                                                    |

**Choice**に設定できる項目は以下になります。

| 項目  | 省略可否 | 型     | デフォルト値 | 説明                                                                                 |
| ----- | -------- | ------ | ------------ | ------------------------------------------------------------------------------------ |
| name  | 可       | string | undefined    | 選択肢の名前。省略時は`value`の値が採用される                                        |
| value | 不可     | string | -            | 選択肢の値。実際のコマンドの引数として使用される値。事前定義変数を含めることができる |

`simple-command-launcher.openCommand`には、**open**コマンドのパスを指定します。デフォルト値は`/usr/bin/open`です。

`simple-command-launcher.vscodeCommand`には、**code**コマンドのパスを指定します。デフォルト値は`/usr/local/bin/code`です。

`simple-command-launcher.defaultDelimiter`には、`executionType`に`inputsForTasks`を指定した外部コマンドの実行結果(`STDOUT`)の各行を`label`と`value`に分割する、拡張機能共通の既定の区切り文字を指定します。デフォルト値は`|`です。

### 設定のスコープ(user/workspace)

`simple-command-launcher.externalCommands`は、**ユーザー設定**・**ワークスペース設定**・**ワークスペースフォルダ設定**のいずれに定義しても、すべてマージされて利用できます。

- マージの優先度は `ユーザー設定` < `ワークスペース設定` < `ワークスペースフォルダ設定` の順(後者が優先)です。
- `name`が同一の項目がある場合は、優先度の高いスコープの項目で**丸ごと上書き**されます(`args`などを引き継ぎたい場合は、上書き側にも必要な項目を記述してください)。
- `name`が異なる項目は追加として扱われ、QuickPickの一覧にはユーザー設定の並び順を維持したまま、ワークスペース専用のコマンドが末尾に追加されます。

```json
// settings.json (ユーザー設定)
"simple-command-launcher.externalCommands": [
  { "name": "deploy", "path": "/usr/local/bin/deploy", "args": [{ "value": "--staging" }] },
  { "name": "logs", "path": "/usr/local/bin/logs" }
]
```

```json
// .vscode/settings.json (ワークスペース設定)
"simple-command-launcher.externalCommands": [
  // 同じnameの項目で上書きされる
  { "name": "deploy", "path": "./scripts/deploy", "args": [{ "value": "--prod" }] },
  // このワークスペース専用コマンドとして追加される
  { "name": "db", "path": "./scripts/db" }
]
```

上記の例でQuickPickに表示されるコマンド名は `deploy` / `logs` / `db` の3件で、`deploy` はワークスペース設定の内容が採用されます。

### 事前定義変数

**引数情報**の`value`(と`choices[].value`)には、VS Codeおなじみの**事前定義変数**を指定できます。事前定義変数は、QuickPickやユーザー入力の値が確定した**コマンド実行時**に展開されます。

| 事前定義変数                 | 展開される値                           |
| ---------------------------- | -------------------------------------- |
| `${workspaceFolder}`         | ワークスペースフォルダのパス(絶対パス) |
| `${workspaceFolderBasename}` | ワークスペースフォルダの名前           |

- マルチルートワークスペースでは、アクティブなエディタが属するワークスペースフォルダを採用します(対象が無い場合は最初のワークスペースフォルダ)。
- ワークスペースが開かれていないなど変数を解決できない場合は警告を表示して処理を終了し、コマンドを実行しません。
- `${workspaceFolder}`と`${workspaceFolderBasename}`以外(`${file}`や`${env:HOME}`など)は展開しません。ただしコマンドは`/bin/sh`経由で実行されるため、シェル側の変数展開(`$HOME`など)は従来どおり有効です。
- 展開後の値に空白が含まれる場合は、シェルで1つの引数として扱われるように自動的にクォートされます(設定側で既にクォートされている場合は付与しません)。

```json
// ..略..
"simple-command-launcher.externalCommands": [
    {
      "name": "git status", // ワークスペースで`git status`を実行する
      "path": "git",
      "args": [
        { "value": "-C" },
        { "value": "${workspaceFolder}" }, // ワークスペースフォルダのパスに展開される
        { "value": "status" }
      ]
    }
  ]
// ..略..
```

### 設定例

```json
// ..略..
"simple-command-launcher.externalCommands": [
    {
      "name": "echo", // quick pickに表示される項目名
      "path": "echo",
      "args": [
        {
          "value": "hello" // 第1引数
        },
        {
          "value": "world", // 第2引数
          "useInput": true  // quick inputで修正可能
        }
      ]
    },
    {
      "name": "blog start", // quick pickに表示される項目名
      "path": "hugo_server.py",
      "args": [
        {
          "value": "~/blog" // 第1引数
        },
        {
          "name": "ポート番号",
          "value": "1313", // 第2引数
        }
      ]
    },
    {
      "name": "blog add content", // quick pickに表示される項目名
      "path": "hugo_add_content.py",
      "args": [
        {
          "value": "~/blog" // 第1引数
        },
        {
          "useInput": true, // 第2引数
          "choices": [            {
              "name": "記事(articles)",
              "value": "articles"
            },
            {
              "name": "TIL",
              "value": "til"
            },
            {
              "name": "ChatGPTとのQ&A",
              "value": "dialogues"
            }
          ]
        },
        {
          "name": "ファイル名",
          "value": "xxxx", // 第3引数
          "useInput": true
        }
      ]
    },
    {
      "name": "open project",
      "path": "/bin/ls",
      "executionType": "pickAndCode", // コマンドの実行結果をQuickPickで選択し、vscodeで開く
      "args": [{ "value": "-dr" }, { "value": "~/hacking/spike/*" }]
    }
  ]
// ..略..
```

## Release Notes

### 0.0.1

初回リリース。

- 設定情報に登録された外部コマンドをvscodeのコマンドとして実行できる。
- 外部コマンドの実行結果の標準出力or標準エラー出力が`出力`タブの`Simple Command Launcher`に表示される。

### 0.0.2

- コマンドの引数に選択肢(`choices`)を選択可能に

### 0.0.3

- コマンドの引数に選択肢(`choices`)の型を`string`から`{ name?: string, value: string}`に変更

### 0.0.4

- `External Commands`に`executionType`を追加し、コマンドの実行結果をQuickPickで選択し、`code`や`open`で開けるように変更

### 0.0.5

- バグ修正: quickPickで取得した値に空白があるとコマンド実行エラーになる。取得値をダブルクォートで囲むように修正。

### 0.0.6

- `runCommand`コマンドの引数に外部コマンド名(`name`)を指定可能に。指定時はコマンド一覧の選択を省略する。
- `executionType`に`inputsForTasks`を追加し、外部コマンドの実行結果(`STDOUT`)の各行をQuickPickで選択して、`tasks.json`の`inputs`の値として利用可能に。
- `inputsForTasks`の実行結果の各行に`label|value`形式をサポートし、表示する`label`とinputsに渡す`value`を分離できるようにした。
- 行を分割する区切り文字として、拡張機能共通の`defaultDelimiter`(デフォルト`|`)と、コマンド情報で上書き可能な`delimiter`を追加した。

### 0.0.7

- `externalCommands`をスコープ単位でマージするように変更。ユーザー設定に加えて、ワークスペース設定・ワークスペースフォルダ設定に定義した外部コマンドも利用可能に。
- 同一の`name`を持つ項目は優先度の高いスコープ(`ワークスペースフォルダ設定` > `ワークスペース設定` > `ユーザー設定`)の項目で上書きされるようにした。

### 0.0.8

- `args`の`value`(と`choices[].value`)に事前定義変数(`${workspaceFolder}`・`${workspaceFolderBasename}`)を指定可能に。コマンド実行時に変数を展開して実行するようにした。
- 事前定義変数を解決できない場合は警告を表示してコマンドの実行を取りやめるようにした。また、展開後の値に空白が含まれる場合は自動的にクォートを付与するようにした。

---

[^1]: [Install from a VSIX # Managing Extensions in Visual Studio Code](https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix)
