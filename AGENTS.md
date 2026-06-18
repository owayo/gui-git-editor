# GUI Git Editor

Git操作（rebase、コミットメッセージ編集、マージコンフリクト解決）をGUIで行うTauriデスクトップアプリケーション。

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Tailwind CSS v4 + Zustand + Monaco Editor + dnd-kit
- **Backend**: Rust + Tauri v2
- **Build**: Vite 8
- **Linter/Formatter**: Biome (`biome.jsonc`、インデント: タブ、クォート: ダブル)
- **Test**: Vitest + Testing Library (jsdom)
- **Package Manager**: pnpm

## Project Structure

```
src/
  App.tsx              # メインコンポーネント（ファイルタイプに基づくルーティング）
  main.tsx             # エントリーポイント
  index.css            # Tailwind CSS
  components/
    commit/            # コミットメッセージエディタ
    rebase/            # Interactive Rebase エディタ
    merge/             # マージコンフリクト解決エディタ
    common/            # 共通コンポーネント（ActionBar, ErrorDisplay等）
    fallback/          # フォールバックエディタ
  stores/              # Zustand ストア
    commitStore.ts     # コミットメッセージ状態
    rebaseStore.ts     # Rebase todo 状態
    mergeStore.ts      # マージコンフリクト状態
    fileStore.ts       # ファイル読み書き
    historyStore.ts    # Undo/Redo 履歴
    stagingStore.ts    # ステージング状態
    themeStore.ts      # テーマ管理（persist）
  hooks/               # カスタムフック
  types/               # 型定義
    git.ts             # Git関連型
    ipc.ts             # Tauri IPC ラッパー
    errors.ts          # エラー型
  utils/               # ユーティリティ
src-tauri/             # Rust バックエンド
```

## Commands

```bash
pnpm install           # 依存関係インストール
pnpm dev               # Vite 開発サーバー起動
pnpm build             # TypeScript + Vite ビルド
pnpm typecheck         # 型チェック
pnpm test              # Vitest テスト実行
pnpm test:watch        # テストウォッチモード
pnpm test:coverage     # カバレッジ付きテスト
pnpm check             # Biome lint + format
pnpm tauri:dev         # Tauri 開発ビルド
pnpm tauri:build       # Tauri リリースビルド
pnpm test:rust         # Rust テスト
pnpm test:all          # 全テスト（JS + Rust）
```

## Architecture Notes

- Tauri IPC は `src/types/ipc.ts` の `safeInvoke` で統一ラッピング（`IpcResult<T>` 型）。引数キーは camelCase で渡す（Tauri v2 の `#[tauri::command]` マクロが `rename_all = "camelCase"` を適用するため、Rust 側の `snake_case` パラメータに対応する）
- テスト環境では Tauri API をモック（`src/test/setup.ts`）
- ストアは Zustand で管理、`stores/index.ts` で一括エクスポート
- テーマは `zustand/middleware/persist` でローカルストレージに永続化
- Rebase エントリ一覧は `role="listbox"` / `role="option"` の ARIA 構造を採用し、項目選択はキーボード操作に対応
- Rebase の `fixup` / `squash` の統合先判定（`hasSquashTargetBeforeIndex`）は `pick` / `reword` / `edit` のみを対象とし、`squash` / `fixup` 自体や `exec` などの特殊コマンドを統合先としない（`findSquashTarget` と整合）
- Rebase の「すべて1つにまとめる」は commit 系エントリだけを `fixup` 化し、`exec`・`label`・`drop` などの特殊行は保持する
- Rebase の `merge -c <commit>` / `merge -C <commit>` は保存後も区別を保持する。`-c` はマージコミットメッセージ編集を要求するため、`-C` に正規化してはいけない
- Rebase の `fixup -C <commit>` / `fixup -c <commit>` は、`-C` / `-c` を `fixup_option` として保持し、`commit_hash` には実コミットハッシュを入れる。選択時の差分取得に `-C` / `-c` を誤って渡さない
- Rebase の `update-ref <ref>` / `u <ref>` は特殊コマンドとして保持し、保存時に未知コマンド扱いで失敗させない
- Rebase の `reword` は `pick` + `exec` 行へシリアライズし、メッセージは base64 経由でシェルに渡す。デコードは GNU coreutils の `base64 -d` と BSD(macOS) の `base64 -D` でフラグが異なるため、`base64 -d </dev/null` で対応可否を判定して両環境にフォールバックする。stdin 供給は実装差のある `echo` ではなく `printf '%s'` を使い、生成する `exec` は必ず単一行に収めて todo の行構造を壊さない
- コミットメッセージ検証の subject/body 行長は UTF-8 バイト数ではなく Unicode 文字数で判定する。日本語 subject を byte length で過大判定しない
- Merge の競合解決は `mergeStore` で行アンカー付きの解決済み置換情報を保持し、連続解決・revert 時の位置ずれを防止
- diff3 形式（`|||||||` を含む）の競合を revert した場合も、BASE セクション付きで復元する
- Merge は空ファイルや片側が空のコンフリクトも有効な入力として扱う。`MergeEditor` と `mergeStore` では `""` を未読み込み扱いせず、未設定判定は `null` のみで行う
- Merge の再読み込みはコンフリクト内容ベースで外部解決を判定し、parse 後のID再採番やID衝突を吸収しつつ、再出現した競合の stale な resolved 状態を保持しない
- Merge の `reloadMergedFile` は `invalidateContentParse` 直後に request id を捕捉し、各 await（`readFile` / `parseConflicts`）後に手動編集（`updateMergedContent`）で supersede されていないか確認する。supersede 後はディスク内容での上書きも `isDirty` のリセットも古い読込/解析エラー表示も行わず中断し、再読み込み中も編集可能な MERGED パネルへの手動入力をサイレントに失わない
- Merge の MERGED パネル手動編集時は `parseConflicts` を再実行して未解決コンフリクト位置を追従し、解決済み置換アンカーも再配置してボタン操作や装飾が古い行位置を参照し続けない
- `fileStore` はファイル読込成功時と読込失敗時、バックアップ作成失敗時に `backupPath` を含む関連状態をクリアし、古い内容やバックアップパスの誤再利用を防止する
- `fileStore.saveFile` は保存完了時に最新の `currentContent` と保存した内容を突き合わせて `isDirty` を再計算する。`await ipc.writeFile` 中に `setContent` が呼ばれた場合でも、ユーザーが追加入力した未保存差分を `isDirty: false` で誤判定しない
- `mergeStore.fetchBlame` は呼び出しごとに `blameRequestId` を進め、応答前に新しい `initMerge` / `fetchBlame` が始まった場合や `mergedPath` が変わった場合は古い blame で上書きしない。`initMerge` 開始時は即座に `blameRequestId` を進めて `localBlame` / `remoteBlame` を `null` にリセットし、新ファイルに旧 blame が一時的に残らない
- `App` は通常ファイル読み込み後に `checkBackupExists` で既存 `.backup` を検出し、`BackupRecoveryDialog` で復元/破棄を選ばせる。バックアップ確認中は `useAutoBackup` を無効化し、前回セッションの `.backup` を新しい自動バックアップで上書きしない。commit/rebase 内容の parse と serialize 結果の保存では `""` を有効な内容として扱い、失敗判定は `null` のみで行う
- `stagingStore` と `commitDiffStore` と `commitStore.validate` は request id で非同期レスポンスを突き合わせ、古い diff/status/validation 応答が新しい結果を上書きしない
- `stagingStore` は同一パスが staged/unstaged の両方に存在する場合でも、ユーザーが選択中の側を維持しつつ、status 更新後の diff を再取得して stale 表示を残さない。`fetchStatus` のエラーパスでは `isLoadingDiff` もリセットし、スピナーの永続表示を防止する
- `useAutoBackup` はバックアップ作成完了が dirty→clean 遷移より遅れた場合でも stale な `.backup` を残さず、`hasBackup` を React state と同期して UI へ即時反映する
- `useKeyboardShortcuts` の undo / redo はグローバル処理するが、input / textarea / contenteditable 上ではネイティブの編集履歴を優先して横取りしない
- `useKeyboardShortcuts` はマージモード時に空オブジェクトを渡して無効化し、`useMergeKeyboardShortcuts` との二重発火を防止する
- `useKeyboardShortcuts` と `useMergeKeyboardShortcuts` の Escape ハンドラは `aria-modal` 要素の存在を確認し、モーダルが開いている場合はモーダル側に処理を委ねてアプリ終了を防止する
- Rust 側の staging コマンドは `git status --porcelain=v1 -z` を使い、空白を含むパスや rename のパスを引用符付き文字列として誤解釈しない
- Rust 側の commit diff コマンドは `git diff-tree --name-status -z -M -C` を使い、タブを含むパスや rename/copy をタブ区切りテキストとして誤解釈しない
- `pnpm-workspace.yaml` の `overrides` で `monaco-editor` 経由の `dompurify` をパッチ済み版へ固定し、production 依存の既知 XSS 脆弱性が再混入しないようにする。pnpm 11 の build script 承認は同ファイルの `allowBuilds` で管理し、現時点では `esbuild` のみ明示許可する
- Rebase の undo / redo は `isUndoRedoRef` フラグで `pushSnapshot` をスキップし、redo 履歴が即座にクリアされる問題を防止する
- `stagingStore` と `commitDiffStore` の `selectFile` は開始時・成功時に `error` をクリアし、diff 取得エラー時は `error` を設定して失敗を握りつぶさない
- Merge の3パネルリサイズは左右どちらのセパレータでも下限クランプ時の余剰をもう一方のパネルに反映し、合計幅を保存する
- `check_codex_available` / `open_codex_terminal_macos` / `resolve_git_root` は `tokio::process::Command` で非同期実行し、Tokio ワーカースレッドのブロックを防止する（`check_git_sc_available` と整合）
- Rust 側の file / merge コマンドは `tokio::fs` を使用してファイル I/O を非同期実行し、Tokio ワーカースレッドのブロックを防止する。事前 `Path::exists()` チェックは行わず読み込みエラーから `FileNotFound` を派生させて TOCTOU を回避する。書き込み・copy の destination 側エラーはパス誤導を避けるため `IoError` に分類する
- `read_merge_files` は LOCAL / REMOTE / BASE / MERGED の読み込みを `tokio::try_join!` で並行実行し、ブロッキングプール上の待ちを重ねる。I/O 失敗時はブランチ名取得 (`detect_branch_names` の git 子プロセス起動) を行わないよう、ファイル読み込み成功後に逐次実行する
- `check_backup_exists` は metadata 取得エラー（権限不足や symlink loop 等）を `Path::exists()` 同様 false 扱いとし、呼び出し側へ伝搬しない。`delete_backup` は NotFound を成功扱いとして冪等性を保つ
- `AppError::from_io_with_path` ヘルパーは `std::io::Error` の `NotFound` / `PermissionDenied` を呼び出し元のパス付きで分類する。`From<std::io::Error>` 経由ではパスが失われるため、ファイル操作の文脈ではこちらを使う
- `restore_backup` の `fs::copy` 失敗時は `map_write_error(&target_path, e)` を渡す。`PermissionDenied` は destination 側の書き込み失敗で発生するのが主なケースであり、エラー表示に `backup_path` を出すと実際の問題箇所（target）の特定を阻害するため、destination のパスを採用する
- Codex 連携の iTerm2 コマンド送信はリクエスト文字列を改行なしの単一行にし、`write text` が改行を Enter として分割実行する問題を防止する
- `git_blame_for_merge` は `side` パラメータを `"local"` / `"remote"` のみ許可し、不正値でサイレントに誤結果を返さない
- `git_blame_for_merge` の `determine_merge_ref` は remote 側で `MERGE_HEAD` / `REBASE_HEAD` / `CHERRY_PICK_HEAD` のいずれも存在しない場合に HEAD へフォールバックせずエラーを返す（local と同じ blame 結果を「remote 側の結果」として返すサイレント誤結果を防止）
- Merge のブランチラベル判定と `git_blame_for_merge` は `git rev-parse --git-dir` で実体の Git directory を解決し、linked worktree の `.git` ファイル構成でも `MERGE_HEAD` / `REBASE_HEAD` / `CHERRY_PICK_HEAD` を正しく参照する
- `format_unix_timestamp` は負のタイムスタンプを `"unknown"` として扱い、`as u32` キャストでの wrap を防止する
- Rust 側の commit diff コマンド (`git_commit_files` / `git_commit_diff`) は `git diff-tree --root` を指定して、親を持たない最初のコミットでも diff 行と差分本体を取得できる
- `mergeStore.buildConflictMarkerText` は LOCAL / BASE / REMOTE セクションが空のコンフリクトでも、revert 時に余計な空行を挿入せず元の構造のまま復元する。ファイル全体が空文字へ解決されたコンフリクトの revert でも、`"".split("\n")` の疑似空行により末尾改行を増やさない
- Codex 連携の iTerm2 コマンド送信は、リクエストだけでなく `merged_path` と project directory も改行なしの単一行に制限する。改行を含むパスは `write text` で入力分割されうるため、送信せず `CommandError` を返す

## Testing Conventions

- テストファイルはソースと同じディレクトリに `*.test.tsx` で配置
- Tauri API（`@tauri-apps/api/core`, `@tauri-apps/plugin-cli`）は `setup.ts` でグローバルモック
- `@testing-library/react` + `@testing-library/user-event` を使用
- `vitest` の `globals: true` 設定済み
- commit/rebase/merge の表示系（`FileList`, `FileDiffViewer`, `TrailersDisplay`, `CommitFileList`, `RebaseEntryList`, `ConflictNavigator`）と `mergeStore` の競合解決・復元・再読み込み整合性ロジックをテストでカバー
- `FileDiffViewer` は `--- a/...` / `+++ b/...` の diff ファイルヘッダーを追加・削除行として色付けしないこと、実際の `---content` / `+++content` 行は追加・削除行として扱うことをテストでカバー
- `utils/rebase.ts` と `rebaseStore` のテストで、特殊コマンドを含む todo に対する `fixup` / `squash` の検証と `squashAll` の安全性をカバー（`squash`/`fixup` のみの場合に統合先なしと判定するケース、plain fixup 化で `fixup_option` を引き継がないケースを含む）
- Rust 側の rebase parser テストで `merge -c` と `merge -C`、`fixup -C` と `fixup -c` の保存時の区別保持、および `update-ref` の保持をカバー
- Rust 側の rebase parser テストで `reword` シリアライズが単一行の `exec` を生成し、生メッセージを平文で漏らさず base64 化すること、GNU(`-d`)/BSD(`-D`) 両対応のデコード判定と `printf '%s'` を含むことをカバー
- Rust 側の commit parser テストで、日本語などの Unicode subject/body 行長を文字数で検証するケースをカバー
- Rust 側の commit diff parser テストで、`git diff-tree --name-status -z` の NUL 区切り出力に含まれるタブ付きパスと rename パスをカバー
- Rust 側の commit diff コマンドテストで、親を持たない最初のコミット（`--root` 指定が必須）に対する `git_commit_files` / `git_commit_diff` の動作をカバー
- Rust 側の `determine_merge_ref` テストで、local 側の HEAD 返却・remote 側の MERGE_HEAD 優先・REBASE_HEAD/CHERRY_PICK_HEAD へのフォールバック・state 不在時のエラー返却をカバー
- Rust 側の `resolve_git_dir` テストで、linked worktree の `.git` ファイルから実体の Git directory を解決し remote 側 state ファイルを参照できることをカバー
- Rust 側の file コマンドテストで、ファイル読み込み時の種別判定、存在しないファイルのパス付きエラー、バックアップ作成・復元・削除のライフサイクルをカバー（さらに `check_backup_exists` が missing 時に `None` を返すこと、`delete_backup` が NotFound を冪等に扱うこと、`create_backup` が存在しないファイルに対し `FileNotFound` を返すこと、`restore_backup` の destination 側 `PermissionDenied` で `target_path` をエラーに残すことを追加でカバー）
- Rust 側の `error::from_io_with_path` テストで、`NotFound` / `PermissionDenied` / その他の io::Error からのエラー分類と、パス情報の保持をカバー
- Rust 側の merge コマンドテストで、`read_file_content` の成功・FileNotFound パス保持、`path_exists` / `path_is_dir` のディレクトリ・ファイル・欠落判定、`read_merge_files` の 3 ファイル並列読み込みと欠落ファイル時の `FileNotFound` 派生をカバー
- `mergeStore` の revert で LOCAL / REMOTE / diff3 BASE が空のコンフリクトを余計な空行なしで復元する動作と、ファイル全体が空文字へ解決されたコンフリクトを末尾改行なしで復元する動作をテストでカバー
- `fileStore`, `stagingStore`, `commitDiffStore` のファイルI/O・Git操作状態管理をテストでカバー（`backupPath` の stale 状態回避、diff/status の競合応答無視、staged/unstaged 両出現時の選択維持と diff 再取得、`fetchStatus` エラー時の `isLoadingDiff` リセット、diff 取得エラー時の `error` 設定を含む）
- `fileStore.saveFile` の保存中 `setContent` 競合（保存した内容と異なる入力で `isDirty: true` 維持、同じ値に戻された場合は `isDirty: false`）をテストでカバー
- `mergeStore.fetchBlame` の request id ガード（応答中に別 `fetchBlame` が走った場合、応答中に `mergedPath` が変わった場合のいずれも古い blame で上書きしない）と、`initMerge` 開始時に `localBlame` / `remoteBlame` が即時 `null` リセットされる挙動をテストでカバー
- `useKeyboardShortcuts` のクロスプラットフォームキーバインド（Cmd/Ctrl）と、入力欄で undo / redo を横取りしない挙動、モーダル表示中の Escape 抑制をテストでカバー
- `useMergeKeyboardShortcuts` のマージ画面キーバインド（保存/キャンセル/コンフリクト移動）とモーダル表示中の Escape 抑制をテストでカバー
- `useAutoBackup` の自動バックアップ間隔・dirty 状態連動・クリーンアップ・保存完了後に遅延完了したバックアップ削除・`hasBackup` 同期をテストでカバー
- `App` の既存バックアップ検出、復元実行、保存成功時のバックアップ削除、既存バックアップ確認中に自動バックアップを開始しない挙動、空文字の commit/rebase 内容を parse して空文字の serialize 結果を保存する挙動をテストでカバー
- `rebaseStore` の `parseContent` / `serialize` IPC連携（成功・失敗・空エントリ）をテストでカバー
- `mergeStore` の `acceptRemote` / `acceptBoth` / コンフリクトナビゲーション / `save` / `initMerge` / `checkCodexAvailable` / `openCodexResolve` / `fetchBlame` / `reloadMergedFile` エラーパス / `clearError` / `updateMergedContent` をテストでカバー
- `mergeStore` の `reloadMergedFile` で、再読み込みの await 中に MERGED パネルを手動編集した場合に、ディスク内容で上書きせずユーザー入力と `isDirty` を保持すること、および supersede 後の読込失敗で古いエラーを表示しないこと（request id ガード）をテストでカバー
- `utils/mergeConflictState` の純粋関数を直接単体テストでカバー（`findReplacementStartLine` の `lineCount===0` 境界・アンカー一致・最近傍フォールバック・同距離タイブレーク・不一致時 null、`resolveConflictInContent` の空/複数行置換、`buildConflictMarkerText` の空セクション・diff3 BASE、`checkAllResolved` の空配列境界、`markResolvedAndShiftConflicts` の未発見 ID・置換行数による endLine 更新・前後コンフリクトの平行移動・diff3 BASE 行のシフト、`updateResolvedReplacementsAfterResolve` の新規追加・前後アンカーのシフト・空文字置換、`markRevertedAndShiftConflicts` の resolved→false 復元と後続シフト、`updateResolvedReplacementsAfterRevert` の対象削除と後続シフト、`reconcileConflictsOnReload` の外部解決判定と再出現時の保持除外、`preserveResolvedConflictsAfterEdit` の再出現済み解決除外、`buildConflictState` の ID 衝突回避と allResolved 算出と未保持メタデータの破棄）
- `mergeStore` の手動編集後に `acceptLocal` が再解析済みの最新行位置を使って解決する動作と、手動編集後も解決済みアンカーを再配置する挙動をテストでカバー
- `mergeStore` の revert 時に後続コンフリクトの行位置と resolvedReplacements の startLine がシフトされる動作をテストでカバー
- `themeStore` のシステムテーマ変更イベントリスナーをテストでカバー
- `ConflictNavigator` の全解決状態表示・前後ナビゲーション・エディタスクロール・editorRef null 安全性をテストでカバー
- `CommandSelector` のコマンド選択・disabled 状態・disabledCommands によるオプション無効化をテストでカバー
- `ipc.ts` の全 IPC ラッパーに対し、`invoke` に渡す引数キーが camelCase であることをテストでカバー（snake_case 混入の再発防止）。引数なし IPC（`checkGitScAvailable`, `checkCodexAvailable`）のエラーハンドリングもカバー
- `RebaseEntryItem` の各コマンド状態（pick/drop/squash/fixup/exec）の表示・スタイル切替・`fixup_option` 表示・squashTarget 表示・aria-selected・キーボード選択をテストでカバー
- `historyStore` の連続 undo で past が枯渇するまで戻る動作をテストでカバー
- `BodyTextarea` の行長超過検出・警告表示・省略表示をテストでカバー
- `BackupRecoveryDialog` のタイトル・ボタン表示、復元/破棄コールバック、aria-modal 属性、フォーカストラップ、Escape での非閉塞をテストでカバー
- `ErrorDisplay` のエラーメッセージ表示・パス表示・閉じるボタンの条件表示をテストでカバー
- `FileStatusBadge` の各ステータス（M/A/D/R/C/?）のラベル・背景色・未知ステータスのフォールバックをテストでカバー
- `commitStore` の `validate` request-ID ガード（古い応答の破棄、単発の正常適用、連続 setSubject での最新結果のみ反映）をテストでカバー
- `RewordModal` の splitMessage/joinMessage ヘルパー（subject/body 分割・結合）、キーボードショートカット（Escape/Cmd+Enter）、props 挙動、git-smart-commit 連携による AI 生成の成功/失敗フローをテストでカバー
- `stagingStore` と `commitDiffStore` の `selectFile` エラーハンドリング（error 設定・開始時クリア・成功時クリア）をテストでカバー
- `fileStore` の読込失敗時に前回ファイル内容が残留しないことをテストでカバー
- Rust 側の `format_unix_timestamp` の負値ガード、`shell_escape` のバッククォート・複合特殊文字、Codex iTerm2 連携の単一行入力検証をテストでカバー
- `ConflictActions` の未解決時 LOCAL / REMOTE / 両方ボタン、解決済み時の戻すボタン、ストアアクション呼び出し、ブランチラベル反映をテストでカバー
- `MergeEditor` は LOCAL が空ファイルでも読み込み待ちに戻らず、3 パネルを表示する挙動と、マージ対象ファイルのパスをヘッダーに表示する挙動（ディレクトリ＋ファイル名の分割表示、ディレクトリを含まないファイル名のみのパス）をテストでカバー
- `MergeActionBar` の保存・キャンセル・ステータス表示、保存成功時の `exitApp(0)` 実行と失敗時の非実行をテストでカバー
- `CodexResolveButton` の利用可否表示・起動ボタン無効化・再読み込みボタン表示・`checkCodexAvailable` 呼び出しをテストでカバー
- テスト環境では `scrollIntoView` と `ResizeObserver` を `setup.ts` でモック（dnd-kit / headlessui が使用）
