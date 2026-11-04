# Spreadsheet

Work with collaborative spreadsheets, formulas, cell formatting, personal sorting/filtering and CSV import/export.

## Install

Requires a running [Ink OS](https://github.com/siliconjungle/ink-os-platform) instance and its `ink-os` CLI. Use Node.js 24 or later for development.

```sh
git clone https://github.com/siliconjungle/ink-app-spreadsheet.git
cd ink-app-spreadsheet
npm ci
npm test
npm run build
# Select your Ink instance using its CLI connection profile.
ink-os deploy .
```

The CLI deploys committed source from your checkout. Commit any edits before deploying them. No credentials or personal instance configuration belong in this repository.

## Behaviour and limits

Formula support is a subset of Excel. CSV exports raw values/formulas; XLSX is unsupported. Structural controls append rows/columns. Imports are bounded to 2 MiB, 5,000 rows, 100 columns and 10,000 populated cells. Workbooks follow instance account permissions.

## Development

`npm run dev` opens a local development server. Preview fixtures are separate from live Ink data.

The collaboration test uses a sibling `ink-os-platform` checkout, or the directory selected by `INK_OS_PLATFORM_DIR`.

## License

MIT for app code. Bundled third-party components retain their own licenses and notices.

## Quick preview

Displays live workbook sheets and calculated values without editing cells. Large previews show the first 200 rows and 30 columns. Ink OS can select this reader through `desktop.preview.fileTypes`, independently of Open with. Space opens the temporary preview from a selection; Escape or Space dismisses it, and arrow keys browse the supplied item order.
