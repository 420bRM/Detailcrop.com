# Chrome 웹 스토어 등록 문구

개발자 대시보드 → 항목 → **스토어 등록정보** 탭에 그대로 붙여 넣습니다.
언어마다 따로 넣는 칸이 있으니, 위쪽 언어 선택에서 한국어 · English · 日本語를 바꿔 가며 넣으세요.

- **제목**은 확장 프로그램 안의 이름(`extension/src/_locales/*/messages.json`의 `name`)을 스토어가 그대로 씁니다. 따로 적는 칸이 없습니다.
- **짧은 설명**도 같은 파일의 `description`(132자 이내)을 씁니다.
- 대시보드에서 직접 적는 것은 **자세한 설명**뿐입니다.
- 스크린샷: `extension/store/screenshots/`의 1280×800 PNG. 언어마다 두 장(`*-1-crops.png`, `*-2-export.png`).
- 카테고리: **Tools(도구)** 또는 **Photos(사진)**. 
- 공식 웹사이트: `https://detailcrop.com/`

---

## 한국어

**제목** — 디테일크롭 – 여러 이미지 한번에 자르기

**짧은 설명** — 이미지마다 같은 비율의 확대컷을 여러 개 잡아 zip 하나로 저장합니다. 사진은 어디에도 올라가지 않습니다.

**자세한 설명**

```
사진 여러 장에서, 한 장마다 여러 군데를 같은 비율로 잘라 zip 하나로 받습니다.

쇼핑몰 상세컷, 작품 확대컷, 인스타 피드 조각처럼 "모든 사진에서 같은 종류의 컷을 같은 규격으로" 뽑아야 할 때 씁니다.

■ 이렇게 씁니다
• 툴바의 디테일크롭 아이콘을 누르면 도구가 열립니다. 사진을 끌어다 놓거나 고르세요.
• 웹페이지의 이미지를 마우스 오른쪽 버튼으로 누르고 "DetailCrop으로 열기"를 고르면 그 이미지가 바로 도구에 들어옵니다. 도구가 이미 열려 있으면 그 작업에 한 장씩 더해집니다.
• 이미지 위에 상자를 끌어 자를 곳을 잡고(한 장에 최대 6컷), "전체 zip으로 내보내기"를 누르면 끝입니다.

■ 할 수 있는 것
• 한 장에서 최대 6컷, 작업 전체에 같은 비율 고정 (1:1, 4:5, 2:3, 16:9, 9:16, 직접 입력)
• 다음 사진은 방금 잡은 상자 배치로 시작
• 원본 해상도 또는 고정 출력 크기, WebP · JPEG · PNG
• 파일명 규칙 지정
• 자르기 전에 사진 수평 · 원근 맞추기
• 인스타그램 피드 3 · 6 · 9분할 (올리는 순서대로 번호)

■ 사진은 어디에도 가지 않습니다
모든 처리가 이 확장 프로그램 안에서 끝납니다. 사진을 서버로 보내지 않고, 사용 통계도 모으지 않으며, 로그인도 없습니다. 오른쪽 버튼으로 연 이미지는 그 이미지가 있는 웹페이지에서 바로 읽어 옵니다.

웹 버전: https://detailcrop.com/ko/
```

## English

**Title** — DetailCrop – Multi Crop for images

**Short description** — Crop several fixed-ratio details out of every image in a batch and save them as one zip. Nothing is uploaded.

**Detailed description**

```
Crop several details out of every image in a batch, all at the same ratio, and save them as one zip.

Made for jobs where every photo needs the same kind of crops at the same size: product detail shots, close-ups of artwork, Instagram feed tiles.

■ How it works
• Click the DetailCrop icon in the toolbar to open the tool, then drop or pick your images.
• Right-click any image on a web page and choose "Open with DetailCrop" to bring it straight into the tool. If the tool is already open, the image joins the batch you are working on.
• Drag boxes over each image (up to six per image) and press "Export all as .zip".

■ What it does
• Up to six crops per image, one locked ratio for the whole batch (1:1, 4:5, 2:3, 16:9, 9:16 or your own)
• The next image starts from the boxes you just placed
• Original resolution or a fixed output size, WebP, JPEG or PNG
• Your own file-name pattern
• Straighten and fix perspective before cropping
• Instagram feed split into 3, 6 or 9 posts, numbered in posting order

■ Your images go nowhere
Everything happens inside the extension. Images are never uploaded, no usage stats are collected, and there is no sign-in. An image you open from the right-click menu is read straight from the page it is on.

Web version: https://detailcrop.com/
```

## 日本語

**タイトル** — DetailCrop – 複数の画像を一括トリミング

**短い説明** — 画像ごとに同じ比率のカットを複数切り出し、zipひとつで保存。写真はどこにもアップロードされません。

**詳しい説明**

```
複数の画像から、1枚ごとに何か所も同じ比率で切り出し、zipひとつで保存します。

商品の詳細画像、作品の寄り、インスタのフィード分割など、「すべての写真から同じ種類のカットを同じ規格で」用意したいときに使います。

■ 使い方
• ツールバーのDetailCropアイコンを押すとツールが開きます。画像をドロップするか選んでください。
• Webページの画像を右クリックして「DetailCropで開く」を選ぶと、その画像がすぐツールに入ります。ツールがすでに開いていれば、作業中のバッチに1枚ずつ追加されます。
• 画像の上でボックスをドラッグして切り出す場所を決め（1枚に最大6カット）、「すべてzipで書き出す」を押せば完了です。

■ できること
• 1枚から最大6カット、バッチ全体で比率を固定（1:1、4:5、2:3、16:9、9:16、手入力）
• 次の画像は、いま決めたボックスの配置から始まります
• 元の解像度または固定の出力サイズ、WebP・JPEG・PNG
• ファイル名の規則を指定
• 切り抜く前に傾き・遠近を補正
• インスタのフィードを3・6・9分割（投稿する順に番号）

■ 写真はどこにも送られません
処理はすべて拡張機能の中で完結します。画像をアップロードせず、利用統計も取らず、ログインもありません。右クリックで開いた画像は、その画像があるWebページから直接読み込みます。

Web版: https://detailcrop.com/ja/
```
