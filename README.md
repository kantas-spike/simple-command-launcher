# simple-command-launcher README

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
```

外部コマンドの設定方法の詳細は、[Extension Settings](#extension-settings)を参照してください。

### コマンド実行

実行手順は以下になります。

1. コマンドパレットから`Simple Command Launcher: Run`を選択します。
2. 登録済の外部コマンドの名前が一覧表示されるので、実行したい名前を選択します。
3. (設定に応じて)コマンド引数のユーザー入力が求められます。必要に応じて引数を編集してEnterを押します。
4. 全ての引数の入力が終われば外部コマンドが実行されます。

## Features

- **設定情報**に複数の外部コマンドを登録可能
- 登録したコマンドをvscodeのコマンドとして呼び出し可能に
  - **run-command**を呼び出すと、登録した外部コマンドの名前の一覧が表示される
  - 実行するコマンドを選択すると
    - 追加の引数が必要な場合は、引数の入力を求められる
    - 入力が完了するとコマンドが実行される
- コマンドの実行結果は`出力`-`Simple Command Launcher`に出力する

## Requirements

- [@vscode/vsce](https://github.com/microsoft/vscode-vsce)

## Extension Settings

`simple-command-launcher.externalCommands`には、**コマンド情報**を配列として設定できます。

**コマンド情報**に設定できる内容は以下になります。

| コマンド情報の項目 | 省略可否 | デフォルト値 | 説明                                                                              |
| ------------------ | -------- | ------------ | --------------------------------------------------------------------------------- |
| name               | 不可     | -            | 外部コマンド名。 `Simple Command Launcher`の`Run`コマンド実行時の選択項目になる。 |
| path               | 不可     | -            | 外部コマンドのパス。`/bin/sh`により実行されるコマンドのパス                       |
| args               | 可       | []           | 外部コマンドに渡す**引数情報**の配列                                              |

**引数情報**に設定できる項目は以下になります。

| 引数情報の項目 | 省略可否 | デフォルト値 | 説明                                                                                                                                                                           |
| -------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| name           | 可       | `引数n`      | 引数名。省略時は、`引数n`となる。(nは引数の番号)                                                                                                                               |
| value          | 不可     | -            | 引数の値                                                                                                                                                                       |
| useInput       | 可       | false        | ユーザー入力の受付有無 。`true`の場合、ユーザー入力から引数を編集できる。その際、`value`の値が初期値として表示される。`false`の場合、`value`の値がそのまま引数として使用される |

## Release Notes

### 0.0.1

初回リリース。

- 設定情報に登録された外部コマンドをvscodeのコマンドとして実行できる。
- 外部コマンドの実行結果の標準出力or標準エラー出力が`出力`タブの`Simple Command Launcher`に表示される。

---

[^1]: [Install from a VSIX # Managing Extensions in Visual Studio Code](https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix)
