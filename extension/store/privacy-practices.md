# 개인정보 관행 · 권한 — Chrome 웹 스토어 답안 초안

개발자 대시보드 → 항목 → **개인정보 보호 관행(Privacy practices)** 탭의 질문에 대한 답입니다.
대시보드 칸은 영어로 묻기 때문에 영어 답을 붙여 넣고, 한국어는 무슨 뜻인지 확인하는 용도입니다.

## 단일 목적 (Single purpose)

> DetailCrop crops several fixed-ratio regions out of each image in a batch and saves them as one zip file, entirely inside the extension.

(여러 이미지에서 한 장마다 같은 비율의 여러 구역을 잘라 zip 하나로 저장하는 것. 모든 처리는 확장 안에서.)

## 권한과 그 이유 (Permission justification)

확장이 요구하는 권한은 **하나**, 필요할 때 사이트별로 묻는 권한이 **하나**입니다.

| 권한 | 언제 | 왜 | 대시보드에 붙여 넣을 문장 |
|---|---|---|---|
| `contextMenus` | 설치할 때 | 웹페이지 이미지의 오른쪽 버튼 메뉴에 "DetailCrop으로 열기"를 넣기 위해 | Adds "Open with DetailCrop" to the right-click menu of images, so a picture on a web page can be opened in the crop tool. |
| 호스트 권한 `http://*/*`, `https://*/*` (**선택 권한**) | 설치할 때는 받지 않음. 이미지를 바로 읽을 수 없는 사이트에서 사용자가 "허용하고 열기"를 누를 때, **그 사이트 하나만** Chrome이 묻는다 | 오른쪽 버튼으로 고른 이미지를 그 사이트에서 읽어 오기 위해. 많은 사이트는 권한 없이도 읽히고, 그렇지 않은 사이트만 묻는다 | Optional, requested at run time for one site at a time, only after the user clicks "Allow and open". It lets the extension read the image the user right-clicked when that site does not share its images with other origins. Nothing is sent to that site or anywhere else. |

쓰지 않는 권한: `tabs`, `activeTab`, `scripting`, `storage`, `downloads`, 콘텐츠 스크립트. 웹페이지에 아무 코드도 넣지 않습니다.
툴바 버튼(`action`)은 권한이 필요 없습니다. 내려받기는 일반 웹페이지처럼 브라우저의 다운로드로 처리되어 `downloads` 권한이 필요 없습니다.

## 원격 코드 (Remote code)

**아니요, 원격 코드를 쓰지 않습니다.** — No, I am not using remote code.

모든 스크립트(`tool.js`, `ext.js`, `background.js`)와 글꼴이 패키지 안에 있습니다. 인라인 스크립트도 없고, 확장 페이지의 보안 정책이 `script-src 'self'`입니다.

## 데이터 사용 (Data usage)

수집하는 항목: **모두 체크하지 않음.** 아래 어느 것도 수집하지 않습니다.

- 개인 식별 정보 (Personally identifiable information) — 아니요
- 건강 정보 — 아니요
- 금융·결제 정보 — 아니요
- 인증 정보 — 아니요
- 개인 통신 — 아니요
- 위치 — 아니요
- 웹 기록 (Web history) — 아니요
- 사용자 활동 (User activity) — 아니요
- 웹사이트 콘텐츠 (Website content) — 아니요. 오른쪽 버튼으로 고른 이미지를 확장 안에서 자를 뿐, 어디에도 보내거나 저장하지 않습니다.

아래 세 문장은 모두 체크합니다 (사실이므로):

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

## 개인정보처리방침 URL

`https://detailcrop.com/privacy/`

(이 페이지 1번 항목에 "Chrome 확장 프로그램은 어떤 정보도 수집하지 않습니다"를 적어 두었습니다. 한국어: `https://detailcrop.com/ko/privacy/`)

## 확인한 것

- 확장 페이지가 확장 밖으로 보낸 요청: 0건 (Playwright로 툴바 열기 · 오른쪽 버튼 불러오기 · zip 내보내기를 하며 모든 요청을 기록)
- 웹 버전의 익명 통계(`/e`), 로그인, 관리자 표시는 빌드할 때 코드째 빠집니다 (`build.py`의 `extension_page`가 확인하고, 남아 있으면 빌드가 멈춥니다).
