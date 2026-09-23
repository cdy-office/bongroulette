# 봉룰렛 SOOP 연결 서버

현재 상태: 로컬에서 사용자가 실제 SOOP 로그인, 문 명령 및 응원 말풍선 작동을 확인했다. 운영 호스팅과 도메인 연결은 별도 검증이 필요하다. 기존 GitHub Pages 운영 브랜치는 아직 변경하지 않았다.

## 키 입력

`.env.local` 파일의 `SOOP_CLIENT_ID=`와 `SOOP_CLIENT_SECRET=` 뒤에 각각 키를 입력한다. 실제 키는 저장소, HTML, 채팅에 올리지 않는다. 이 파일은 Git 및 Docker 빌드에서 제외되고 웹 서버에서도 제공하지 않는다.

## 로컬 실행

이 폴더에서 `npm install`과 `npm run install-browser`를 최초 한 번 실행한다. 이후 `start.cmd`를 실행하거나 `npm start`를 사용한다. 게임 주소는 http://127.0.0.1:4174/ 이다.

실제 로컬 로그인 테스트를 하려면 SOOP Developers의 Redirect URL을 정확히 `http://127.0.0.1:4174/`로 등록해야 한다. 현재 등록된 `http://bongroulette.com/`은 이 서버가 아니므로 로컬 인증에 사용할 수 없다. SOOP가 localhost 등록을 허용하지 않으면 HTTPS 운영 주소를 먼저 확보해야 한다.

## 구조와 검증 경계

- 서버: Node.js, 메모리 세션, HttpOnly 쿠키, 인증 요청의 Origin/CSRF 검사 및 일회용 OAuth state 확인.
- 공식 ChatSDK는 접속 패킷에도 시크릿 키를 사용한다. 따라서 서버 전용 Chromium에서 SDK를 실행하며 브라우저에는 앱 시크릿·접근 토큰·갱신 토큰을 보내지 않는다.
- SDK의 MESSAGE 이벤트에서 메시지 본문만 전달하며 닉네임, 계정 ID, 후원 이벤트는 게임에 전달하거나 기록하지 않는다.
- 이벤트 스트림은 채팅을 저장·재전송하지 않는다. 끊김·만료·로그아웃 시 연결과 임시 세션을 폐기한다. SDK 자동 재연결은 사용하지 않는다.
- 문 선택의 실제 채팅은 기존 물리 게임의 명령 함수로 전달한다. 대기·일시정지·결과 화면 입력은 버리고 자동 체험 및 시험 버튼은 실제 연결 중 비활성화한다.
- 일반 채팅은 화면 아래 중앙에 최대 4개, 6초 동안 표시한다. `!내용`은 콜로세움·레이스·폭탄 돌리기에서 무작위 생존 구슬 위에 최대 4개, 4초 동안 표시하며 2D/3D 카메라를 따라간다. 내용은 80자로 제한하고 HTML로 해석하지 않는다. 문 선택에서는 기존 `!왼`/`!오` 명령만 집계한다.
- **실제 OAuth 호환성 미확인:** 공개 문서에는 state 반환 보장이 명시되어 있지 않다. 이 서버는 잘못되거나 누락된 state를 거절한다. 실제 앱에서 `/ ?soop=state` 오류가 나면 SOOP 측의 state/PKCE 지원 또는 검증된 별도 인증 흐름을 확인해야 한다. 검사를 제거해서 배포하지 않는다.
- 실제 채팅 접속은 방송 중인 스트리머 본인 계정으로 검증해야 한다. SDK JOIN 이벤트와 getRoomInfo 응답은 키 입력 후 실환경에서 확인한다.

## 운영 배포

이 구조는 실행 서버와 Chromium이 필요하므로 GitHub Pages만으로 운영할 수 없다. 컨테이너 호스팅 또는 VPS에서 프로젝트 루트를 빌드 컨텍스트로 `docker build -f soop-server/Dockerfile .`을 실행한다. 키는 호스팅의 비밀 환경변수에 등록한다.

Render에서는 저장소 루트의 render.yaml로 무료 검증 서버를 생성한다. 키 두 개는 비밀 환경변수 입력란에만 넣는다. 기본 주소는 Render의 RENDER_EXTERNAL_URL에서 자동으로 읽는다. SOOP Redirect URL에는 해당 HTTPS 주소의 `/` 경로를 등록한다. `/healthz`는 세션을 생성하지 않는 상태 확인용이다. 무료 서버는 유휴 시 중지될 수 있으므로 방송용 상시 운영 전 용량과 요금제를 확정한다.

도메인을 이 서버로 옮길 때 APP_ORIGIN을 실제 HTTPS 도메인으로 설정하고 SOOP Redirect URL도 일치시킨다. DNS 전환은 Render 주소에서 실제 로그인과 방송 채팅을 검증한 다음 진행한다. 외부 HTTP 인증은 서버가 거절한다.

리버스 프록시의 응답 버퍼링을 끄고 이벤트 스트림 연결을 허용한다. OAuth query/code 및 토큰·채팅을 프록시 접근로그에 기록하지 않도록 설정한다. 서버는 단일 프로세스의 메모리 세션을 사용하므로 자동 다중 인스턴스 배포를 하지 않는다. 세션당 서버 브라우저 페이지가 필요하므로 동시 사용자에 맞는 자원을 확보한다.

사용자 키와 호스팅 계정·도메인 설정 전에는 실서비스 연결 완료로 표시하지 않는다. 개인정보처리방침도 실제 호스팅 업체와 저장·삭제 방식으로 확정해야 한다.

## 검증

`npm test`: 모의 OAuth 공급자와 채팅 이벤트로 CSRF/state 거절, 코드 재사용 거절, 키 유출 방지, 연결 폐기, 문 개방 및 관중석 표시를 확인한다. 모의 성공은 SOOP 실계정 검증을 대신하지 않는다.

문서 확인: 2026-09-23
- https://developers.sooplive.co.kr/docs/chatsdk/oauth
- https://developers.sooplive.co.kr/docs/chatsdk/connection
- https://developers.sooplive.co.kr/docs/chatsdk/get-message
