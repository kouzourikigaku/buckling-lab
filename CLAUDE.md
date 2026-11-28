# 座屈ラボ(buckling-lab)

座屈の物理(オイラー座屈 → 非弾性座屈 → 設計曲線 → 板の局部座屈)を 3D の映像と補足ページで学ぶ Web アプリ。 Vite + React + TypeScript + Tailwind + three.js。**返答は日本語**。

## 作業を始める前に
- 引き継ぎの記録(作業の経緯・方針・定石・落とし穴)は Private のリポジトリ **kouzourikigaku/lab-notes** の `buckling-lab/` にある(CLAUDE.md・HANDOFF_NEW_TOPICS.md・REVIEW_FOR_CODEX.md)。セッションに add_repo で加えて全部読んでから作業する。記録の更新もそちらへ commit・push する。
- **このリポジトリは公開**。コード・コメント・画面の文・コミットの文に、依頼の言葉の引用や、個人・職場・自宅に関わることを書かない。

## コマンド
`npm install` → `npm run dev` / `npm run build`(型チェック込み)/ `npm test`
main に push すると GitHub Actions が GitHub Pages に公開する。
