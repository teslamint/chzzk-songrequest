# Chzzk-SongRequest

## 이게 뭔가요?

네이버 치지직 플랫폼에서 노래 신청을 받고 위젯을 통해 영상을 띄워주는 서비스입니다.

## 시작하기

먼저 채팅봇으로 사용할 네이버 계정으로 네이버에 로그인해 생성된 NID_AUT, NID_SES 쿠키의 값을 가져와야 합니다.

Docker Compose를 사용할 경우 아래 예제 파일을 참고하세요.

```yaml
version: '3'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=songrequest
      - POSTGRES_USER=songrequest
      - POSTGRES_PASSWORD=changeme
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --save 60 1 --loglevel warning

  app:
    image: teslamint/chzzk-songrequest
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_HOST=redis
      - DATABASE_URL=postgresql://songrequest:changeme@postgres/songrequest
      - NID_AUT=[네이버 로그인 후 저장된 쿠키값]
      - NID_SES=[네이버 로그인 후 저장된 쿠키값]

  caddy:
    image: caddy:alpine
    ports:
      - "127.0.0.1:3000:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

```

### 위젯 페이지 접속 방법

위 Docker Compose 파일을 이용해 로컬에서 서버를 띄웠을 경우, 위젯 페이지 접속 주소는 아래와 같습니다.

```text
http://localhost:3000/widget/[네이버 치지직 채널 아이디]
```

### 채팅방 명령어

```
!명령어 - 명령어 모음을 출력합니다.
!sr <URL> - 유튜브 영상을 재생 대기열에 추가합니다.
!sl - 현재 대기열에 등록된 총 영상 갯수 및 길이를 표시합니다.
!cs - 현재 재생중인 곡을 표시합니다.
!skip - 현재 재생중인 곡을 건너뜁니다.
!clear - 대기열에 남아있는 곡을 비웁니다.
```

## 개발하기

### 의존 패키지 설치

본 리포지터리를 복제하신 후 아래 명령어를 통해 의존 패키지를 설치합니다.

```bash
$ pnpm install
```

### 앱 실행

`.env.sample` 파일을 참고해 `.env` 파일을 만든 후, 상황에 따라 아래 명령어를 실행하시면 됩니다.

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

### 테스트

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## License

[MIT licensed](LICENSE).
