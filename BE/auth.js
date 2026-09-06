/**
 * ui/auth.py 의 포팅.
 *
 * 원본은 Streamlit 내장 st.login()/st.user/st.logout() 으로 Google OIDC 를 처리했다.
 * Express 에는 그런 게 없으므로 OAuth 2.0 Authorization Code 흐름을 직접 구현한다
 * (추가 라이브러리 없이 fetch 만 사용). 정책은 원본과 동일하다:
 *
 *   1. Google 로그인
 *   2. 이메일이 @mju.ac.kr 로 끝나야 함
 *   3. 고정 닉네임을 설정해야 서비스 이용 가능 (한 번 정하면 변경 불가)
 *
 * 세션은 cookie-session(서명된 쿠키)에 담는다. 서버 메모리에 세션을 두지 않으므로
 * Railway 가 컨테이너를 재시작해도 로그인이 풀리지 않는다. 쿠키에는 user id 만
 * 넣고, 권한/정지/관리자 여부는 매 요청마다 DB에서 다시 읽는다.
 */
import * as db from './db.js';
import { campusOptions } from './campus.js';
import { isVisionConfigured } from './vision.js';

export const ALLOWED_EMAIL_DOMAIN = '@mju.ac.kr';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

/** Google OAuth 설정이 실제로 들어왔는지 (원본 is_auth_configured). */
export function isAuthConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/**
 * 지금 이 프로세스가 "인터넷에 공개된 배포본"인지.
 *
 * NODE_ENV 만 보지 않는 이유: 그건 사람이 손으로 넣는 값이라 깜빡 빠뜨리기 쉽고,
 * 실제로 한 번 빠뜨린 적이 있다. Railway 는 RAILWAY_* 변수를 자동으로 주입하므로
 * 그걸 함께 보면, 환경변수를 잘못 넣어도 공개 서버에서는 확실히 잠긴다.
 * (안전한 쪽을 기본값으로 두는 게 목적이다.)
 */
function isPublicDeployment() {
  return Boolean(
    process.env.NODE_ENV === 'production'
    || process.env.RAILWAY_ENVIRONMENT
    || process.env.RAILWAY_PUBLIC_DOMAIN
    || process.env.RAILWAY_PROJECT_ID
  );
}

/**
 * 개발용 로그인 허용 여부.
 * Google 설정 없이도 로컬에서 바로 화면을 보고 테스트할 수 있게 하는 우회로다.
 * 이게 열려 있으면 아무 이메일이나 넣어서 그 사람으로 로그인할 수 있으므로,
 * 공개 배포본에서는 절대 열리면 안 된다.
 *
 * 판단 순서:
 *   1. ALLOW_DEV_LOGIN=true 를 사람이 직접 넣었으면 허용 (의도적 탈출구)
 *   2. 공개 배포본이면 무조건 차단
 *   3. 로컬이고 Google 설정이 없으면 허용
 */
export function isDevLoginEnabled() {
  if (process.env.ALLOW_DEV_LOGIN === 'true') return true;
  if (isPublicDeployment()) return false;
  return !isAuthConfigured();
}

export function isAllowedDomain(email) {
  return Boolean(email) && String(email).toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);
}

/** 배포 도메인. Railway 는 RAILWAY_PUBLIC_DOMAIN 을 자동으로 넣어준다. */
function publicOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `${req.protocol}://${req.get('host')}`;
}

export function redirectUri(req) {
  return `${publicOrigin(req)}/api/auth/callback`;
}

/** Google 동의 화면으로 보낼 URL. state 는 CSRF 방지용으로 세션에 저장한다. */
export function buildGoogleAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * authorization code 를 Google 토큰 엔드포인트에서 교환하고, id_token 의
 * payload 에서 email/name 을 꺼낸다.
 *
 * id_token 서명을 따로 검증하지 않는 이유: 이 토큰은 브라우저를 거치지 않고
 * 서버가 TLS 로 Google 토큰 엔드포인트에 직접 요청해서 받은 응답이다.
 * (OpenID Connect Core 3.1.3.7 이 "코드 흐름에서 토큰 엔드포인트 직통 응답은
 * 서명 검증 생략 가능"으로 명시한 바로 그 경우다.)
 */
export async function exchangeCodeForProfile(req, code) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Google 토큰 교환 실패 (${res.status}): ${await res.text()}`);
  }
  const { id_token: idToken } = await res.json();
  if (!idToken) throw new Error('Google 응답에 id_token 이 없습니다.');

  const payloadPart = idToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  return { email: payload.email, name: payload.name || payload.given_name || '' };
}

/**
 * 세션의 user id -> 실제 User 행. 매 요청마다 DB를 다시 읽는다
 * (쿠키에 담긴 닉네임/관리자 여부 같은 걸 신뢰하지 않기 위해서).
 * 로그인 안 했거나 행이 사라졌으면 null.
 */
export function currentUser(req) {
  const userId = req.session?.userId;
  if (!userId) return null;
  return db.getUserById(userId);
}

/**
 * 로그인 + 도메인 + 닉네임까지 통과한 사용자만 통과시키는 라우터 가드
 * (원본 auth.require_ready_user 에 대응).
 * 실패 시 응답을 직접 보내고 null 을 돌려주므로, 호출부는 반환값이 null 이면 그냥 return 한다.
 */
export function requireReadyUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: '로그인이 필요합니다.', code: 'LOGIN_REQUIRED' });
    return null;
  }
  if (!isAllowedDomain(user.email)) {
    res.status(403).json({ error: '명지대학교 계정(@mju.ac.kr)만 이용할 수 있습니다.', code: 'DOMAIN_NOT_ALLOWED' });
    return null;
  }
  if (user.nickname === null) {
    res.status(403).json({ error: '먼저 닉네임을 설정해주세요.', code: 'NICKNAME_REQUIRED' });
    return null;
  }
  return user;
}

/**
 * 관리자 전용 가드. requireReadyUser 를 통과한 뒤 is_admin 을 DB에서 다시 확인한다.
 * 다만 이건 편의용 1차 방어선일 뿐이고, 실제 강제는 db.listReportsForAdmin() /
 * db.processReport() / db.applyReportAction() 안에서 매번 다시 이루어진다.
 */
export function requireAdminUser(req, res) {
  const user = requireReadyUser(req, res);
  if (!user) return null;
  if (!db.isAdmin(user.id)) {
    res.status(403).json({ error: '관리자만 접근할 수 있습니다.', code: 'ADMIN_REQUIRED' });
    return null;
  }
  return user;
}

/** 화면 상단/사이드바에 필요한 현재 사용자 상태 묶음 (원본 app.py 홈 화면의 데이터). */
export function buildMeResponse(req) {
  const user = currentUser(req);
  const base = {
    authConfigured: isAuthConfigured(),
    devLoginEnabled: isDevLoginEnabled(),
    allowedDomain: ALLOWED_EMAIL_DOMAIN,
    categories: db.CATEGORIES,
    reportReasons: db.REPORT_REASONS,
    nicknameRules: {
      min: db.NICKNAME_MIN_LENGTH,
      max: db.NICKNAME_MAX_LENGTH,
      changeDays: db.NICKNAME_CHANGE_DAYS,
    },
    maxPostImages: db.MAX_POST_IMAGES,
    reactions: db.ALLOWED_REACTIONS,
    campuses: campusOptions(),
    imageSearchEnabled: isVisionConfigured(),
  };
  if (!user) return { ...base, loggedIn: false, user: null };

  const domainOk = isAllowedDomain(user.email);
  if (!domainOk) {
    return {
      ...base,
      loggedIn: true,
      domainAllowed: false,
      user: { email: user.email, name: user.name },
    };
  }

  return {
    ...base,
    loggedIn: true,
    domainAllowed: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      isAdmin: Boolean(user.is_admin),
      isSuspended: db.isUserSuspended(user.id),
      trustScore: user.trust_score,
      campus: user.campus,
      // 지금 닉네임을 바꿀 수 있는지 + 못 바꾸면 며칠 남았는지
      nicknameChange: user.nickname ? db.nicknameChangeStatus(user.id) : { canChange: false, daysLeft: 0 },
    },
    counts: {
      unreadMessages: user.nickname ? db.countUnreadMessagesByUser(user.id) : 0,
      unreadNotifications: user.nickname ? db.countUnreadNotifications(user.id) : 0,
    },
  };
}
