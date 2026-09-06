/**
 * db/database.py 를 그대로 옮긴 데이터 계층 (better-sqlite3).
 *
 * 파이썬 원본과의 대응:
 *   PermissionDeniedError  -> PermissionDeniedError (HTTP 403)
 *   ValueError             -> ValidationError       (HTTP 400)
 *   sqlite3.Row            -> 평범한 JS 객체
 *
 * 권한/유효성 검사는 전부 여기(DB 계층)에 있다. BE/server.js 의 라우터는
 * "로그인했는가"만 보고, 실제 소유권·관리자·정지 여부는 이 파일이 매번
 * DB를 다시 읽어서 판단한다 (파이썬 원본과 동일한 정책).
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CAMPUS, isValidCampus } from './campus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Railway에서는 Volume을 /data 에 마운트하고 DATA_DIR=/data 로 지정한다.
// 그래야 재배포해도 DB와 업로드 이미지가 지워지지 않는다. (README 참고)
export const DATA_DIR = path.resolve(PROJECT_ROOT, process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'lost_found.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const LOST_STATUSES = new Set(['찾는 중', '찾음']);
export const FOUND_STATUSES = new Set(['보관 중', '완료']);
export const CATEGORIES = ['전자기기', '필기구', '책', '지갑', '카드', '의류', '가방', '액세서리', '기타'];
export const REPORT_REASONS = ['사기/허위 정보', '부적절한 내용', '욕설/비방', '개인정보 노출', '도배/스팸', '기타'];

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;
// 화이트리스트(블랙리스트가 아님): 한글/영문/숫자만 통과시키므로
// < > & " ' / 같은 HTML/스크립트 주입 문자는 애초에 저장되지 않는다.
const NICKNAME_RE = /^[가-힣a-zA-Z0-9]+$/;

export const SUSPENDED_ACCOUNT_MESSAGE = '정지된 계정은 이 기능을 사용할 수 없습니다.';
export const HIDDEN_MESSAGE_PLACEHOLDER = '[관리자에 의해 숨겨진 메시지입니다.]';
export const MESSAGE_PAGE_SIZE = 50;

export const REPORT_TARGET_TYPES = new Set(['post', 'message', 'user']);
export const REPORT_STATUSES = new Set(['pending', 'dismissed', 'actioned']);
export const MODERATION_ACTION_TYPES = new Set(['delete_post', 'hide_message', 'suspend_user']);
export const NOTIFICATION_TYPES = new Set([
  'message', 'match', 'report_processed', 'post_deleted', 'message_hidden', 'user_suspended',
  'comment', 'trust',
]);

// Report.target_type 별로 허용되는 단 하나의 action_type.
const TARGET_TYPE_TO_ACTION_TYPES = {
  post: new Set(['delete_post']),
  message: new Set(['hide_message']),
  user: new Set(['suspend_user']),
};

// YYYY-MM-DD 또는 YYYY-MM-DD HH:MM(:SS)
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;

export class PermissionDeniedError extends Error {
  constructor(message) { super(message); this.name = 'PermissionDeniedError'; this.status = 403; }
}
export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; this.status = 400; }
}

function validateDatetime(value, fieldName) {
  if (!DATETIME_RE.test(String(value ?? ''))) {
    throw new ValidationError(`${fieldName}는 'YYYY-MM-DD' 또는 'YYYY-MM-DD HH:MM' 형식이어야 합니다.`);
  }
}

// ---------------------------------------------------------------- schema

// db/schema.sql 을 그대로 옮기되, 파이썬 쪽 _migrate_* 함수들이 나중에
// 덧붙이던 컬럼(nickname / is_admin / suspension / hidden_* / direct chat)을
// 처음부터 포함시킨 "최종형" 스키마다. 새 프로젝트라 마이그레이션이 필요 없다.
const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    nickname TEXT,
    -- 닉네임을 마지막으로 바꾼 시각. NULL 이면 아직 한 번도 안 바꾼 것.
    nickname_changed_at TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    is_suspended INTEGER NOT NULL DEFAULT 0 CHECK (is_suspended IN (0, 1)),
    suspended_until TEXT,
    -- 명지도(신뢰도). 모두 50에서 시작해 0~100 사이에서만 움직인다.
    trust_score REAL NOT NULL DEFAULT 50.0,
    -- 주로 쓰는 캠퍼스. 등록 폼/게시판 탭의 기본값으로만 쓰이고, 권한과는 무관하다.
    campus TEXT NOT NULL DEFAULT 'humanities' CHECK (campus IN ('humanities', 'natural')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LostPost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES User(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    lost_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '찾는 중' CHECK (status IN ('찾는 중', '찾음')),
    -- 인문(서울) / 자연(용인). 두 캠퍼스는 멀리 떨어져 있어 게시글이 서로 섞이면
    -- 오히려 방해가 되므로, 조회·검색·매칭이 모두 이 값으로 갈린다.
    campus TEXT NOT NULL DEFAULT 'humanities' CHECK (campus IN ('humanities', 'natural')),
    -- 대표 이미지 1장. image_urls 의 첫 번째와 같은 값을 넣어 두어, 사진 여러 장을
    -- 지원하기 전에 쓰던 코드/데이터가 그대로 동작하게 한다.
    image_url TEXT,
    -- 사진 전체 목록(JSON 배열 문자열). 최대 3장.
    image_urls TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS FoundPost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES User(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    found_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '보관 중' CHECK (status IN ('보관 중', '완료')),
    -- 인문(서울) / 자연(용인). 두 캠퍼스는 멀리 떨어져 있어 게시글이 서로 섞이면
    -- 오히려 방해가 되므로, 조회·검색·매칭이 모두 이 값으로 갈린다.
    campus TEXT NOT NULL DEFAULT 'humanities' CHECK (campus IN ('humanities', 'natural')),
    -- 대표 이미지 1장. image_urls 의 첫 번째와 같은 값을 넣어 두어, 사진 여러 장을
    -- 지원하기 전에 쓰던 코드/데이터가 그대로 동작하게 한다.
    image_url TEXT,
    -- 사진 전체 목록(JSON 배열 문자열). 최대 3장.
    image_urls TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "Match" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lost_post_id INTEGER NOT NULL REFERENCES LostPost(id) ON DELETE CASCADE,
    found_post_id INTEGER NOT NULL REFERENCES FoundPost(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    -- '돌려받았어요' 를 양쪽이 각각 누른 시각. 둘 다 차면 completed_at 이 찍히고
    -- 그때 한 번만 명지도가 오른다.
    lost_confirmed_at TEXT,
    found_confirmed_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (lost_post_id, found_post_id)
);

-- ChatRoom 은 두 가지 모양 중 하나다:
--   1) 매칭 기반    : match_id 가 있고 direct_* 는 전부 NULL
--   2) 다이렉트 채팅: match_id 가 NULL 이고 direct_*_post_id + initiator_user_id 가 채워짐
-- (게시글에서 작성자에게 바로 말 거는 경로. Match 를 만들지 않는다.)
CREATE TABLE IF NOT EXISTS ChatRoom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER UNIQUE REFERENCES "Match"(id) ON DELETE CASCADE,
    direct_lost_post_id INTEGER REFERENCES LostPost(id) ON DELETE CASCADE,
    direct_found_post_id INTEGER REFERENCES FoundPost(id) ON DELETE CASCADE,
    initiator_user_id INTEGER REFERENCES User(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_room_id INTEGER NOT NULL REFERENCES ChatRoom(id) ON DELETE CASCADE,
    sender_user_id INTEGER NOT NULL REFERENCES User(id),
    content TEXT NOT NULL,
    -- 사진 메시지. 사진만 보내도 content 는 '[사진]' 으로 채운다(목록 미리보기용).
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT,
    hidden_at TEXT,
    hidden_by_user_id INTEGER REFERENCES User(id),
    hidden_reason TEXT
);

CREATE TABLE IF NOT EXISTS Report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_user_id INTEGER NOT NULL REFERENCES User(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'message', 'user')),
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'actioned')),
    processed_at TEXT,
    processed_by_user_id INTEGER REFERENCES User(id),
    admin_note TEXT,
    UNIQUE (reporter_user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS ModerationAction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL UNIQUE REFERENCES Report(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'message', 'user')),
    target_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('delete_post', 'hide_message', 'suspend_user')),
    reason TEXT,
    admin_user_id INTEGER NOT NULL REFERENCES User(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS Notification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES User(id),
    type TEXT NOT NULL CHECK (
        type IN ('message', 'match', 'report_processed', 'post_deleted', 'message_hidden',
                 'user_suspended', 'comment', 'trust')
    ),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    related_type TEXT,
    related_id INTEGER,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, type, related_type, related_id)
);

-- 게시글 조회 기록. 같은 사람이 여러 번 봐도 조회수는 한 번만 오르게 하는 근거다.
-- post_kind + post_id 로 두 게시판을 한 테이블에서 다룬다(각 테이블의 id 가
-- 서로 독립된 시퀀스라 숫자만으로는 구분되지 않기 때문).
CREATE TABLE IF NOT EXISTS PostView (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_kind TEXT NOT NULL CHECK (post_kind IN ('lost', 'found')),
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES User(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (post_kind, post_id, user_id)
);

CREATE TABLE IF NOT EXISTS Comment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_kind TEXT NOT NULL CHECK (post_kind IN ('lost', 'found')),
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES User(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 메시지 이모지 반응. 한 사람이 같은 메시지에 같은 이모지를 두 번 달 수 없다
-- (다시 누르면 취소되는 토글 동작을 UNIQUE 로 뒷받침한다).
CREATE TABLE IF NOT EXISTS MessageReaction (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES Message(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES User(id),
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (message_id, user_id, emoji)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_nickname ON User(nickname);
CREATE INDEX IF NOT EXISTS idx_postview_post ON PostView(post_kind, post_id);
CREATE INDEX IF NOT EXISTS idx_comment_post ON Comment(post_kind, post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reaction_message ON MessageReaction(message_id);
CREATE INDEX IF NOT EXISTS idx_lostpost_user_id ON LostPost(user_id);
-- campus 인덱스는 여기 두면 안 된다. 이미 만들어진 DB에서는 위의 CREATE TABLE 이
-- 아무 일도 하지 않으므로(IF NOT EXISTS) campus 컬럼이 아직 없고, 인덱스 생성이
-- "no such column: campus" 로 실패해 서버가 아예 못 뜬다.
-- 컬럼을 붙이는 runMigrations() 안에서 만든다.
CREATE INDEX IF NOT EXISTS idx_foundpost_user_id ON FoundPost(user_id);
CREATE INDEX IF NOT EXISTS idx_match_lost_post_id ON "Match"(lost_post_id);
CREATE INDEX IF NOT EXISTS idx_match_found_post_id ON "Match"(found_post_id);
CREATE INDEX IF NOT EXISTS idx_message_chat_room_id ON Message(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_message_chat_room_created_id ON Message(chat_room_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_report_reporter_user_id ON Report(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_report_status ON Report(status);
CREATE INDEX IF NOT EXISTS idx_notification_user_read_created ON Notification(user_id, is_read, created_at DESC);
-- 다이렉트 채팅방의 (게시물, 개설자) 중복 방지. 매칭 기반 방은 direct_* 가 NULL 이라 제외된다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatroom_direct_lost_unique
    ON ChatRoom(direct_lost_post_id, initiator_user_id) WHERE direct_lost_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatroom_direct_found_unique
    ON ChatRoom(direct_found_post_id, initiator_user_id) WHERE direct_found_post_id IS NOT NULL;
`;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

/**
 * 이미 만들어진 DB에 새 컬럼을 덧붙인다.
 *
 * 위의 CREATE TABLE 은 IF NOT EXISTS 라서, 이미 테이블이 있는 DB(= 배포된 서버)에는
 * 아무 일도 하지 않는다. 그래서 나중에 추가된 컬럼은 여기서 따로 붙여 줘야 한다.
 * SQLite 의 ALTER TABLE ADD COLUMN 은 테이블을 다시 만들지 않아 빠르고 안전하며,
 * 이 함수는 몇 번 실행해도 결과가 같다(이미 있으면 건너뛴다).
 */
function runMigrations() {
  const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  const addColumn = (table, name, definition) => {
    if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  addColumn('User', 'nickname_changed_at', 'TEXT');
  addColumn('User', 'trust_score', 'REAL NOT NULL DEFAULT 50.0');

  for (const table of ['LostPost', 'FoundPost']) {
    addColumn(table, 'image_urls', 'TEXT');
    addColumn(table, 'view_count', 'INTEGER NOT NULL DEFAULT 0');
    // 기존 글은 전부 인문캠퍼스로 본다. 캠퍼스가 없던 시절의 글이라 달리 알 방법이
    // 없고, 작성자가 '내 게시물'에서 언제든 옮길 수 있다.
    addColumn(table, 'campus', "TEXT NOT NULL DEFAULT 'humanities'");
  }
  // 사용자가 주로 쓰는 캠퍼스. 등록 폼과 게시판 탭의 기본값으로만 쓰인다.
  addColumn('User', 'campus', "TEXT NOT NULL DEFAULT 'humanities'");

  // campus 컬럼이 확실히 생긴 뒤에 인덱스를 만든다(스키마 쪽에 두면 옛 DB에서 실패한다).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lostpost_campus ON LostPost(campus, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_foundpost_campus ON FoundPost(campus, created_at DESC);
  `);

  addColumn('"Match"', 'lost_confirmed_at', 'TEXT');
  addColumn('"Match"', 'found_confirmed_at', 'TEXT');
  addColumn('"Match"', 'completed_at', 'TEXT');

  addColumn('Message', 'image_url', 'TEXT');

  // Notification.type 의 CHECK 제약에는 'comment'/'trust' 가 없던 시절이 있다.
  // CHECK 는 ALTER 로 못 고치므로, 새 타입이 실제로 들어가는지 시험해 보고
  // 막히면 그때만 테이블을 다시 만든다(평소에는 아무 일도 하지 않는다).
  const acceptsNewTypes = (() => {
    try {
      db.exec('SAVEPOINT check_notification_type');
      db.prepare(`INSERT INTO Notification (user_id, type, title, content) VALUES (0, 'comment', 'x', 'x')`).run();
      return true;
    } catch {
      return false;
    } finally {
      db.exec('ROLLBACK TO check_notification_type');
      db.exec('RELEASE check_notification_type');
    }
  })();

  if (!acceptsNewTypes) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE Notification_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES User(id),
          type TEXT NOT NULL CHECK (
              type IN ('message', 'match', 'report_processed', 'post_deleted', 'message_hidden',
                       'user_suspended', 'comment', 'trust')
          ),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          related_type TEXT,
          related_id INTEGER,
          is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, type, related_type, related_id)
      );
      INSERT INTO Notification_new
        SELECT id, user_id, type, title, content, related_type, related_id, is_read, created_at
        FROM Notification;
      DROP TABLE Notification;
      ALTER TABLE Notification_new RENAME TO Notification;
      CREATE INDEX IF NOT EXISTS idx_notification_user_read_created
        ON Notification(user_id, is_read, created_at DESC);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
}

runMigrations();

export { db };

/** 개발용: 모든 테이블을 지우고 스키마를 다시 만든다 (npm run db:reset). */
export function resetDatabase() {
  const tables = ['Notification', 'ModerationAction', 'Report', 'Message', 'ChatRoom',
    '"Match"', 'FoundPost', 'LostPost', 'User'];
  db.pragma('foreign_keys = OFF');
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
}

const isUniqueViolation = (e) => String(e?.code || '').startsWith('SQLITE_CONSTRAINT');

// ---------------------------------------------------------------- User

export function createUser(email, name) {
  return db.prepare('INSERT INTO User (email, name) VALUES (?, ?)').run(email, name).lastInsertRowid;
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM User WHERE id = ?').get(userId) ?? null;
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM User WHERE email = ?').get(email) ?? null;
}

/** 인증된 이메일에 해당하는 User 행을 가져오거나 새로 만들고 id 를 돌려준다. */
export function resolveUserId(email, name) {
  const existing = getUserByEmail(email);
  if (existing) return existing.id;
  return createUser(email, name || email.split('@')[0]);
}

/**
 * 현재 "실제로 유효한" 정지 상태인지. 영구 정지(suspended_until IS NULL)이거나
 * 기한부 정지가 아직 안 끝났으면 true. 기한이 지난 정지는 행을 되돌려 쓰지 않고
 * 읽는 시점에 "정지 아님"으로 계산만 한다 (감사 기록은 그대로 남긴다).
 */
export function isUserSuspended(userId) {
  const user = getUserById(userId);
  if (!user || !user.is_suspended) return false;
  if (user.suspended_until === null) return true; // 영구 정지
  const row = db.prepare("SELECT ? > datetime('now') AS still_suspended").get(user.suspended_until);
  return Boolean(row.still_suspended);
}

/**
 * 정지된 사용자의 *새로운* 글/상호작용을 막는다. 기존 데이터 열람(목록/상세 조회)은
 * 영향이 없고, 새 행을 만드는 함수들만 이걸 호출한다.
 */
function requireNotSuspended(userId) {
  if (isUserSuspended(userId)) throw new PermissionDeniedError(SUSPENDED_ACCOUNT_MESSAGE);
}

/**
 * 공개용 고정 닉네임을 딱 한 번만 설정한다. 변경 함수는 일부러 없다.
 * "아직 미설정일 때만"이라는 보장은 UPDATE 의 WHERE nickname IS NULL 이 원자적으로 해준다.
 */
export function setInitialNickname(userId, nicknameRaw) {
  const user = getUserById(userId);
  if (!user) throw new ValidationError(`User ${userId} not found`);
  if (user.nickname !== null) throw new ValidationError('닉네임은 이미 설정되어 변경할 수 없습니다.');

  const nickname = String(nicknameRaw ?? '').trim();
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new ValidationError(`닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다.`);
  }
  if (!NICKNAME_RE.test(nickname)) {
    throw new ValidationError('닉네임은 한글/영문/숫자만 사용할 수 있습니다.');
  }

  try {
    const info = db.prepare('UPDATE User SET nickname = ? WHERE id = ? AND nickname IS NULL')
      .run(nickname, userId);
    if (info.changes === 0) throw new ValidationError('닉네임은 이미 설정되어 변경할 수 없습니다.');
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError('이미 사용 중인 닉네임입니다.');
    throw e;
  }
}

/** 사용자가 주로 쓰는 캠퍼스를 바꾼다. 게시글의 캠퍼스는 건드리지 않는다. */
export function setUserCampus(userId, campus) {
  if (!isValidCampus(campus)) throw new ValidationError('캠퍼스를 선택해주세요.');
  db.prepare('UPDATE User SET campus = ? WHERE id = ?').run(campus, userId);
}

export const NICKNAME_CHANGE_DAYS = 30;

/**
 * 처음 설정 이후의 닉네임 변경. 30일에 한 번만 가능하다.
 *
 * "언제 또 바꿀 수 있는지"는 nickname_changed_at 하나로만 판단한다. 이 값이 NULL 이면
 * (= 최초 설정 후 아직 한 번도 바꾼 적이 없으면) 바로 바꿀 수 있다.
 * 남은 기간 계산과 갱신을 한 UPDATE 안에서 처리해, 두 번 눌러도 두 번 바뀌지 않는다.
 */
export function changeNickname(userId, nicknameRaw) {
  const user = getUserById(userId);
  if (!user) throw new ValidationError(`User ${userId} not found`);
  if (user.nickname === null) throw new ValidationError('먼저 닉네임을 설정해주세요.');

  const nickname = String(nicknameRaw ?? '').trim();
  if (nickname === user.nickname) throw new ValidationError('지금 쓰고 있는 닉네임입니다.');
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new ValidationError(`닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다.`);
  }
  if (!NICKNAME_RE.test(nickname)) {
    throw new ValidationError('닉네임은 한글/영문/숫자만 사용할 수 있습니다.');
  }

  const status = nicknameChangeStatus(userId);
  if (!status.canChange) {
    throw new ValidationError(`닉네임은 ${NICKNAME_CHANGE_DAYS}일에 한 번만 바꿀 수 있습니다. (${status.daysLeft}일 남음)`);
  }

  try {
    const info = db.prepare(`
      UPDATE User SET nickname = ?, nickname_changed_at = datetime('now')
      WHERE id = ?
        AND (nickname_changed_at IS NULL
             OR nickname_changed_at <= datetime('now', ?))
    `).run(nickname, userId, `-${NICKNAME_CHANGE_DAYS} days`);
    if (info.changes === 0) {
      throw new ValidationError(`닉네임은 ${NICKNAME_CHANGE_DAYS}일에 한 번만 바꿀 수 있습니다.`);
    }
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError('이미 사용 중인 닉네임입니다.');
    throw e;
  }
}

/** 지금 닉네임을 바꿀 수 있는지 + 못 바꾸면 며칠 남았는지. */
export function nicknameChangeStatus(userId) {
  const user = getUserById(userId);
  if (!user || user.nickname === null) return { canChange: false, daysLeft: 0 };
  if (!user.nickname_changed_at) return { canChange: true, daysLeft: 0 };

  // 남은 일수를 소수까지 그대로 받아서 판단한다. 정수로 잘라 버리면 "0.5일 남음"과
  // "0.5일 지남"이 똑같이 0이 되어, 기한이 지났는데도 잠긴 것처럼 보인다.
  const row = db.prepare(`
    SELECT julianday(datetime(?, ?)) - julianday(datetime('now')) AS days_remaining
  `).get(user.nickname_changed_at, `+${NICKNAME_CHANGE_DAYS} days`);

  const remaining = row.days_remaining ?? 0;
  if (remaining <= 0) return { canChange: true, daysLeft: 0 };
  return { canChange: false, daysLeft: Math.ceil(remaining) };
}

// ------------------------------------------------------- LostPost / FoundPost
//
// 파이썬 원본은 lost/found 용 함수를 미러링해서 두 벌 갖고 있었다.
// 여기서는 두 테이블의 차이가 (테이블명, 시각 컬럼명, 허용 상태값) 세 개뿐이라
// 그 셋만 담은 설정 객체로 한 벌만 구현한다 -- 동작은 완전히 동일하다.
const POST_KINDS = {
  lost: { table: 'LostPost', dateField: 'lost_at', statuses: LOST_STATUSES, defaultStatus: '찾는 중' },
  found: { table: 'FoundPost', dateField: 'found_at', statuses: FOUND_STATUSES, defaultStatus: '보관 중' },
};

export function postKindConfig(kind) {
  const cfg = POST_KINDS[kind];
  if (!cfg) throw new ValidationError(`invalid post kind: ${kind}`);
  return cfg;
}

export const MAX_POST_IMAGES = 3;

/**
 * DB 행을 화면이 쓰기 좋은 모양으로 다듬는다.
 * image_url(대표 1장)과 image_urls(JSON 배열)를 하나의 images 배열로 합쳐 주므로,
 * 사진이 1장이던 시절에 저장된 글도 여러 장인 글과 똑같이 다룰 수 있다.
 */
function decoratePost(row, kind) {
  if (!row) return null;
  let images = [];
  if (row.image_urls) {
    try {
      const parsed = JSON.parse(row.image_urls);
      if (Array.isArray(parsed)) images = parsed.filter((u) => typeof u === 'string' && u);
    } catch {
      // 손상된 값이면 아래 image_url 로만 채운다 -- 목록 전체가 깨지는 것보다 낫다.
    }
  }
  if (!images.length && row.image_url) images = [row.image_url];
  return { ...row, kind, images };
}

export function createPost(kind, {
  userId, title, description, category, location, at, campus, imageUrls = [], status = null,
}) {
  const cfg = postKindConfig(kind);
  requireNotSuspended(userId);
  const finalStatus = status ?? cfg.defaultStatus;
  if (!cfg.statuses.has(finalStatus)) throw new ValidationError(`invalid status: ${finalStatus}`);
  if (!isValidCampus(campus)) throw new ValidationError('캠퍼스를 선택해주세요.');
  validateDatetime(at, cfg.dateField);

  const images = (imageUrls || []).slice(0, MAX_POST_IMAGES);
  return db.prepare(
    `INSERT INTO ${cfg.table}
       (user_id, title, description, category, location, ${cfg.dateField},
        campus, image_url, image_urls, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, title, description, category, location, at, campus,
    images[0] ?? null, images.length ? JSON.stringify(images) : null, finalStatus
  ).lastInsertRowid;
}

export function getPost(kind, postId) {
  const cfg = postKindConfig(kind);
  const row = db.prepare(
    `SELECT p.*, u.nickname AS author_nickname, u.trust_score AS author_trust_score
     FROM ${cfg.table} p JOIN User u ON u.id = p.user_id
     WHERE p.id = ?`
  ).get(postId) ?? null;
  return decoratePost(row, kind);
}

/** 키워드/카테고리/상태 필터. 셋 다 비우면 전체 목록이 된다. */
export function searchPosts(kind, { keyword = '', category = null, status = null, campus = null } = {}) {
  const cfg = postKindConfig(kind);
  const conditions = [];
  const params = [];
  if (keyword) {
    conditions.push('(p.title LIKE ? OR p.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (category) { conditions.push('p.category = ?'); params.push(category); }
  if (status) { conditions.push('p.status = ?'); params.push(status); }
  // 캠퍼스가 지정되면 그 캠퍼스 글만 본다. AI 매칭·자동 알림도 이 필터를 거치므로
  // 여기 한 곳만 지켜도 "경계를 넘지 않는다"가 전체에 적용된다.
  if (campus) { conditions.push('p.campus = ?'); params.push(campus); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT p.*, u.nickname AS author_nickname, u.trust_score AS author_trust_score,
            (SELECT COUNT(*) FROM Comment c WHERE c.post_kind = ? AND c.post_id = p.id) AS comment_count
     FROM ${cfg.table} p JOIN User u ON u.id = p.user_id
     ${where}
     ORDER BY p.created_at DESC`
  ).all(kind, ...params);
  return rows.map((r) => decoratePost(r, kind));
}

export function listPostsByUser(kind, userId) {
  const cfg = postKindConfig(kind);
  return db.prepare(`SELECT * FROM ${cfg.table} WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId).map((r) => decoratePost(r, kind));
}

/**
 * 조회수 1 올리기. 같은 사람이 몇 번을 봐도 한 번만 오르고, 작성자 본인은 세지 않는다.
 * PostView 의 UNIQUE(post_kind, post_id, user_id) 가 "1인 1회"를 실제로 보장하므로,
 * 동시에 두 번 눌려도 중복으로 오르지 않는다.
 * 반환값은 (올랐든 안 올랐든) 현재 조회수다.
 */
export function bumpViewCount(kind, postId, requestingUserId) {
  const cfg = postKindConfig(kind);
  const post = getPost(kind, postId);
  if (!post) throw new ValidationError('게시물을 찾을 수 없습니다.');
  if (post.user_id === requestingUserId) return post.view_count;

  try {
    return db.transaction(() => {
      db.prepare('INSERT INTO PostView (post_kind, post_id, user_id) VALUES (?, ?, ?)')
        .run(kind, postId, requestingUserId);
      db.prepare(`UPDATE ${cfg.table} SET view_count = view_count + 1 WHERE id = ?`).run(postId);
      return db.prepare(`SELECT view_count FROM ${cfg.table} WHERE id = ?`).get(postId).view_count;
    })();
  } catch (e) {
    if (isUniqueViolation(e)) return post.view_count; // 이미 본 사람
    throw e;
  }
}

// ---------------------------------------------------------------- Comment

export const COMMENT_MAX_LENGTH = 500;

/** 게시글 댓글 목록(오래된순). 작성자 닉네임을 조인해 N+1 조회를 피한다. */
export function listComments(kind, postId) {
  postKindConfig(kind);
  return db.prepare(`
    SELECT c.id, c.user_id, c.content, c.created_at,
           u.nickname AS author_nickname, u.trust_score AS author_trust_score
    FROM Comment c JOIN User u ON u.id = c.user_id
    WHERE c.post_kind = ? AND c.post_id = ?
    ORDER BY c.created_at ASC, c.id ASC
  `).all(kind, postId);
}

/**
 * 댓글 작성. 게시글 작성자에게 'comment' 알림이 같은 트랜잭션으로 생성된다
 * (자기 글에 자기가 단 댓글은 알리지 않는다).
 */
export function createComment(kind, postId, requestingUserId, contentRaw) {
  postKindConfig(kind);
  requireNotSuspended(requestingUserId);
  const post = getPost(kind, postId);
  if (!post) throw new ValidationError('게시물을 찾을 수 없습니다.');

  const content = String(contentRaw ?? '').trim();
  if (!content) throw new ValidationError('댓글 내용을 입력해주세요.');
  if (content.length > COMMENT_MAX_LENGTH) {
    throw new ValidationError(`댓글은 ${COMMENT_MAX_LENGTH}자까지 쓸 수 있습니다.`);
  }

  return db.transaction(() => {
    const id = db.prepare('INSERT INTO Comment (post_kind, post_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(kind, postId, requestingUserId, content).lastInsertRowid;
    if (post.user_id !== requestingUserId) {
      const writer = getUserById(requestingUserId);
      insertNotification(post.user_id, 'comment', '새 댓글이 달렸습니다',
        `${writer.nickname}님이 '${post.title}'에 댓글을 남겼습니다.`, 'comment', id);
    }
    return id;
  })();
}

/**
 * 댓글이 어느 게시물에 달렸는지. 알림에서 "그 글로 이동"할 때 쓴다.
 * 댓글이 이미 지워졌으면 null.
 */
export function getCommentTarget(commentId) {
  return db.prepare('SELECT post_kind, post_id FROM Comment WHERE id = ?').get(commentId) ?? null;
}

/** 댓글 삭제. 댓글 작성자 본인 또는 관리자만 지울 수 있다. */
export function deleteComment(commentId, requestingUserId) {
  const comment = db.prepare('SELECT * FROM Comment WHERE id = ?').get(commentId);
  if (!comment) throw new ValidationError('댓글을 찾을 수 없습니다.');
  if (comment.user_id !== requestingUserId && !isAdmin(requestingUserId)) {
    throw new PermissionDeniedError('본인이 쓴 댓글만 삭제할 수 있습니다.');
  }
  db.prepare('DELETE FROM Comment WHERE id = ?').run(commentId);
}

function checkPostOwner(kind, postId, requestingUserId) {
  const post = getPost(kind, postId);
  if (!post) throw new ValidationError(`게시물을 찾을 수 없습니다. (${kind} #${postId})`);
  if (post.user_id !== requestingUserId) {
    throw new PermissionDeniedError('본인 게시물만 수정/삭제할 수 있습니다.');
  }
  return post;
}

// 분실/습득 시각은 원본 UI와 동일하게 수정 대상에서 제외한다(삭제 후 재등록 안내).
const UPDATABLE_POST_FIELDS = new Set([
  'title', 'description', 'category', 'location', 'campus', 'image_url', 'image_urls', 'status',
]);

export function updatePost(kind, postId, requestingUserId, fields) {
  const cfg = postKindConfig(kind);
  checkPostOwner(kind, postId, requestingUserId);

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  for (const [col] of entries) {
    if (!UPDATABLE_POST_FIELDS.has(col)) throw new ValidationError(`수정할 수 없는 항목입니다: ${col}`);
  }
  const statusEntry = entries.find(([c]) => c === 'status');
  if (statusEntry && !cfg.statuses.has(statusEntry[1])) {
    throw new ValidationError(`invalid status: ${statusEntry[1]}`);
  }
  const campusEntry = entries.find(([c]) => c === 'campus');
  if (campusEntry && !isValidCampus(campusEntry[1])) {
    throw new ValidationError('캠퍼스를 선택해주세요.');
  }
  if (!entries.length) return;

  const setClause = entries.map(([col]) => `${col} = ?`).join(', ');
  db.prepare(`UPDATE ${cfg.table} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...entries.map(([, v]) => v), postId);
}

export function deletePost(kind, postId, requestingUserId) {
  const cfg = postKindConfig(kind);
  checkPostOwner(kind, postId, requestingUserId);
  db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(postId);
}

// ---------------------------------------------------------------- Match

export function getMatchByPosts(lostPostId, foundPostId) {
  return db.prepare('SELECT * FROM "Match" WHERE lost_post_id = ? AND found_post_id = ?')
    .get(lostPostId, foundPostId) ?? null;
}

export function getMatch(matchId) {
  return db.prepare('SELECT * FROM "Match" WHERE id = ?').get(matchId) ?? null;
}

/**
 * LostPost <-> FoundPost 매칭을 get-or-create.
 * requestingUserId 는 둘 중 한쪽 게시물의 작성자여야 한다(양쪽 다 확정 가능).
 * 멱등: 이미 있으면 기존 id 를 그대로 돌려주고 알림도 다시 만들지 않는다.
 * 성공 시 두 게시물 소유자 각각에게 'match' 알림이 같은 트랜잭션 안에서 생성된다.
 */
export function createMatch(lostPostId, foundPostId, score, requestingUserId) {
  requireNotSuspended(requestingUserId);
  const lostPost = getPost('lost', lostPostId);
  if (!lostPost) throw new ValidationError(`찾아요 게시물 #${lostPostId} 을(를) 찾을 수 없습니다.`);
  const foundPost = getPost('found', foundPostId);
  if (!foundPost) throw new ValidationError(`찾았어요 게시물 #${foundPostId} 을(를) 찾을 수 없습니다.`);
  if (![lostPost.user_id, foundPost.user_id].includes(requestingUserId)) {
    throw new PermissionDeniedError('본인 게시물에 대해서만 매칭을 확정할 수 있습니다.');
  }
  if (lostPost.campus !== foundPost.campus) {
    throw new ValidationError('서로 다른 캠퍼스의 게시물은 매칭할 수 없습니다.');
  }

  const existing = getMatchByPosts(lostPostId, foundPostId);
  if (existing) return existing.id;

  try {
    return db.transaction(() => {
      const matchId = db.prepare('INSERT INTO "Match" (lost_post_id, found_post_id, score) VALUES (?, ?, ?)')
        .run(lostPostId, foundPostId, score).lastInsertRowid;
      for (const participantId of new Set([lostPost.user_id, foundPost.user_id])) {
        insertNotification(participantId, 'match', '새로운 매칭이 성립되었습니다',
          'AI 매칭이 확정되어 채팅을 시작할 수 있습니다.', 'match', matchId);
      }
      return matchId;
    })();
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = getMatchByPosts(lostPostId, foundPostId);
      if (again) return again.id;
    }
    throw e;
  }
}

/**
 * user_id 가 분실물 쪽 또는 습득물 쪽 소유자인 매칭 목록.
 * 관련 게시물 필드를 한 쿼리에 조인해서 매칭당 추가 조회(N+1)를 없앴고,
 * 안 읽은 메시지 수도 같은 쿼리에서 센다.
 */
export function listMatchesByUser(userId) {
  return db.prepare(`
    SELECT
      m.id AS match_id, m.score AS score, m.created_at AS match_created_at,
      m.lost_confirmed_at, m.found_confirmed_at, m.completed_at,
      lp.id AS lost_post_id, lp.user_id AS lost_post_user_id, lp.title AS lost_title,
      lp.category AS lost_category, lp.location AS lost_location, lp.lost_at AS lost_at,
      lp.status AS lost_status, lp.image_url AS lost_image_url, lu.nickname AS lost_user_nickname,
      fp.id AS found_post_id, fp.user_id AS found_post_user_id, fp.title AS found_title,
      fp.category AS found_category, fp.location AS found_location, fp.found_at AS found_at,
      fp.status AS found_status, fp.image_url AS found_image_url, fu.nickname AS found_user_nickname,
      (
        SELECT COUNT(*) FROM Message msg
        JOIN ChatRoom cr ON cr.id = msg.chat_room_id
        WHERE cr.match_id = m.id AND msg.sender_user_id != ? AND msg.read_at IS NULL
      ) AS unread_count
    FROM "Match" m
    JOIN LostPost lp ON lp.id = m.lost_post_id
    JOIN FoundPost fp ON fp.id = m.found_post_id
    JOIN User lu ON lu.id = lp.user_id
    JOIN User fu ON fu.id = fp.user_id
    WHERE lp.user_id = ? OR fp.user_id = ?
    ORDER BY m.created_at DESC
  `).all(userId, userId, userId);
}

/** 확정된 매칭 취소. Match 행만 지우고 게시물(상태 포함)은 건드리지 않는다. */
export function deleteMatch(matchId, requestingUserId) {
  const match = getMatch(matchId);
  if (!match) throw new ValidationError('이미 취소된 매칭입니다.');
  if (match.completed_at) throw new ValidationError('이미 완료된 매칭은 취소할 수 없습니다.');
  if (!matchParticipantIds(matchId).has(requestingUserId)) {
    throw new PermissionDeniedError('본인과 관련된 매칭만 취소할 수 있습니다.');
  }
  db.prepare('DELETE FROM "Match" WHERE id = ?').run(matchId);
}

// ------------------------------------------------- 명지도(신뢰도) · 되찾음 마무리

export const TRUST_MIN = 0;
export const TRUST_MAX = 100;
export const TRUST_START = 50;
export const TRUST_DEAL_BONUS = 0.5;   // 거래 완료 시 양쪽 +0.5%p
export const TRUST_REPORT_PENALTY = 3; // 신고가 인용되면 -3%p

/**
 * 명지도를 delta 만큼 올리거나 내린다. 0~100 을 벗어나지 않게 잘라낸다.
 * 호출자의 트랜잭션 안에서 실행되도록 conn 대신 db 를 그대로 쓰되,
 * 알림까지 같이 남겨서 "왜 변했는지"를 사용자가 알 수 있게 한다.
 * relatedType/relatedId 는 알림 중복 방지 키로도 쓰인다.
 */
function adjustTrust(userId, delta, title, content, relatedType, relatedId) {
  const user = getUserById(userId);
  if (!user) return;
  const next = Math.min(TRUST_MAX, Math.max(TRUST_MIN, user.trust_score + delta));
  // 소수점 오차가 쌓이지 않도록 소수 둘째 자리에서 정리한다.
  db.prepare('UPDATE User SET trust_score = ? WHERE id = ?').run(Math.round(next * 100) / 100, userId);
  insertNotification(userId, 'trust', title, content, relatedType, relatedId);
}

/**
 * "돌려받았어요" -- 매칭을 끝냈다고 표시한다.
 *
 * 한 사람이 누르면 그쪽만 기록되고, 상대도 누르면 그때 완료 처리된다.
 * 완료 시점에 딱 한 번:
 *   - 양쪽 게시물이 '찾음' / '완료' 로 바뀌고
 *   - 양쪽 명지도가 +0.5%p 오른다
 * completed_at 이 이미 차 있으면 아무 일도 하지 않으므로, 두 번 눌러도 중복 지급되지 않는다.
 *
 * 반환: { completed, myConfirmed, otherConfirmed }
 */
export function confirmDeal(matchId, requestingUserId) {
  const match = getMatch(matchId);
  if (!match) throw new ValidationError('매칭을 찾을 수 없습니다.');
  requireNotSuspended(requestingUserId);

  const lostPost = getPost('lost', match.lost_post_id);
  const foundPost = getPost('found', match.found_post_id);
  if (!lostPost || !foundPost) throw new ValidationError('연결된 게시물이 삭제되었습니다.');

  const isLostSide = lostPost.user_id === requestingUserId;
  const isFoundSide = foundPost.user_id === requestingUserId;
  if (!isLostSide && !isFoundSide) {
    throw new PermissionDeniedError('본인과 관련된 매칭만 완료할 수 있습니다.');
  }
  if (match.completed_at) {
    return { completed: true, myConfirmed: true, otherConfirmed: true, alreadyCompleted: true };
  }

  return db.transaction(() => {
    // 내가 어느 쪽인지에 따라 해당 컬럼만 찍는다. 한 사람이 양쪽 글을 다 가진
    // 경우(자기 글끼리 매칭)에는 두 컬럼이 함께 차서 바로 완료된다.
    if (isLostSide) {
      db.prepare(`UPDATE "Match" SET lost_confirmed_at = COALESCE(lost_confirmed_at, datetime('now')) WHERE id = ?`).run(matchId);
    }
    if (isFoundSide) {
      db.prepare(`UPDATE "Match" SET found_confirmed_at = COALESCE(found_confirmed_at, datetime('now')) WHERE id = ?`).run(matchId);
    }

    const after = getMatch(matchId);
    const bothConfirmed = Boolean(after.lost_confirmed_at && after.found_confirmed_at);

    if (bothConfirmed) {
      // WHERE completed_at IS NULL 이 "딱 한 번만"을 보장한다.
      const info = db.prepare(`UPDATE "Match" SET completed_at = datetime('now') WHERE id = ? AND completed_at IS NULL`)
        .run(matchId);
      if (info.changes === 1) {
        db.prepare(`UPDATE LostPost SET status = '찾음', updated_at = datetime('now') WHERE id = ?`).run(lostPost.id);
        db.prepare(`UPDATE FoundPost SET status = '완료', updated_at = datetime('now') WHERE id = ?`).run(foundPost.id);
        for (const uid of new Set([lostPost.user_id, foundPost.user_id])) {
          adjustTrust(uid, TRUST_DEAL_BONUS, '명지도가 올랐습니다',
            `물건을 무사히 주고받아 명지도가 ${TRUST_DEAL_BONUS}%p 올랐습니다.`, 'match', matchId);
        }
      }
    }

    return {
      completed: bothConfirmed,
      myConfirmed: true,
      otherConfirmed: isLostSide ? Boolean(after.found_confirmed_at) : Boolean(after.lost_confirmed_at),
    };
  })();
}

// ---------------------------------------------------------------- Chat

/** 매칭 채팅방 참여자: 분실물 작성자 + 습득물 작성자. 매번 게시물에서 새로 계산한다. */
function matchParticipantIds(matchId) {
  const match = getMatch(matchId);
  if (!match) throw new ValidationError(`매칭 #${matchId} 을(를) 찾을 수 없습니다.`);
  const lostPost = getPost('lost', match.lost_post_id);
  const foundPost = getPost('found', match.found_post_id);
  return new Set([lostPost, foundPost].filter(Boolean).map((p) => p.user_id));
}

/**
 * 다이렉트(Match 없는) 채팅방 참여자: 개설자 + 게시물의 현재 작성자.
 * 게시물이 이미 삭제됐다면 개설자만 남는다(방어적 처리).
 */
function directChatParticipantIds(room) {
  const post = room.direct_lost_post_id !== null
    ? getPost('lost', room.direct_lost_post_id)
    : getPost('found', room.direct_found_post_id);
  const ids = new Set([room.initiator_user_id]);
  if (post) ids.add(post.user_id);
  return ids;
}

/** 두 종류의 방을 하나로 처리하는 진입점 -- 모든 채팅 권한 검사가 여기를 지난다. */
function chatRoomParticipantIds(room) {
  return room.match_id !== null ? matchParticipantIds(room.match_id) : directChatParticipantIds(room);
}

/**
 * 채팅방 참여자 id 목록. 실시간 이벤트를 "이 방 사람들에게만" 보내려고 공개한다.
 * 방이 없으면 빈 배열(이미 삭제된 방에 대고 이벤트를 쏘지 않기 위해).
 */
export function chatRoomParticipants(chatRoomId) {
  const room = db.prepare('SELECT * FROM ChatRoom WHERE id = ?').get(chatRoomId);
  if (!room) return [];
  try {
    return [...chatRoomParticipantIds(room)];
  } catch {
    return [];
  }
}

/** Match 하나당 ChatRoom 하나를 get-or-create. 참여자만 열 수 있다. */
export function getOrCreateChatRoom(matchId, requestingUserId) {
  if (!matchParticipantIds(matchId).has(requestingUserId)) {
    throw new PermissionDeniedError('본인과 관련된 매칭만 채팅할 수 있습니다.');
  }
  const find = () => db.prepare('SELECT * FROM ChatRoom WHERE match_id = ?').get(matchId) ?? null;
  const existing = find();
  if (existing) return existing;
  try {
    db.prepare('INSERT INTO ChatRoom (match_id) VALUES (?)').run(matchId);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // 경합에서 졌을 뿐 -- 아래 재조회가 주워온다
  }
  const room = find();
  if (!room) throw new Error(`Failed to create ChatRoom for Match ${matchId}`);
  return room;
}

/**
 * 게시판 뷰어가 게시물 작성자에게 바로 말을 거는 다이렉트 채팅방 get-or-create.
 * Match 를 거치지 않는다. 검사 순서: 실존 유저 -> 정지 아님 -> 게시물 존재 -> 자기 글 아님.
 * 멱등: 같은 (게시물, 개설자) 조합이면 기존 방을 돌려준다(부분 UNIQUE 인덱스가 뒷받침).
 */
export function getOrCreateDirectChatRoom(postKind, postId, requestingUserId) {
  if (!getUserById(requestingUserId)) throw new ValidationError(`User ${requestingUserId} not found`);
  requireNotSuspended(requestingUserId);

  postKindConfig(postKind); // 잘못된 kind 면 여기서 ValidationError
  const column = postKind === 'lost' ? 'direct_lost_post_id' : 'direct_found_post_id';
  const post = getPost(postKind, postId);
  if (!post) throw new ValidationError('게시물을 찾을 수 없습니다.');
  if (post.user_id === requestingUserId) {
    throw new PermissionDeniedError('자기 자신의 게시물에는 채팅을 시작할 수 없습니다.');
  }

  const find = () => db.prepare(`SELECT * FROM ChatRoom WHERE ${column} = ? AND initiator_user_id = ?`)
    .get(postId, requestingUserId) ?? null;
  const existing = find();
  if (existing) return existing;
  try {
    db.prepare(`INSERT INTO ChatRoom (${column}, initiator_user_id) VALUES (?, ?)`)
      .run(postId, requestingUserId);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  const room = find();
  if (!room) throw new Error(`Failed to create direct ChatRoom for ${postKind} post ${postId}`);
  return room;
}

/** 참여자에게만 ChatRoom 행을 돌려준다. 클라이언트가 보낸 room id 를 절대 그대로 믿지 않는다. */
export function getChatRoom(chatRoomId, requestingUserId) {
  const room = db.prepare('SELECT * FROM ChatRoom WHERE id = ?').get(chatRoomId) ?? null;
  if (!room) throw new ValidationError('존재하지 않거나 삭제된 채팅방입니다.');
  if (!chatRoomParticipantIds(room).has(requestingUserId)) {
    throw new PermissionDeniedError('이 채팅방에 접근할 권한이 없습니다.');
  }
  return room;
}

/**
 * 채팅방 헤더에 필요한 정보 (pages/5_채팅.py 상단 로직의 포팅).
 * 매칭 방이면 내/상대 게시물 라벨 + AI 점수를, 다이렉트 방이면 게시물 제목을 만든다.
 */
export function getChatRoomView(chatRoomId, requestingUserId) {
  const room = getChatRoom(chatRoomId, requestingUserId);
  let myPostLabel;
  let otherPostLabel;
  let otherUserId = null;
  let score = null;
  // 채팅방 상단에 띄울 "이 대화가 걸린 물건" 카드. 매칭 방이면 상대 쪽 게시물을,
  // 다이렉트 방이면 대화의 출발점이 된 그 게시물을 보여준다.
  let subjectPost = null;
  let match = null;

  if (room.match_id !== null) {
    match = listMatchesByUser(requestingUserId).find((m) => m.match_id === room.match_id);
    if (!match) throw new ValidationError('연결된 매칭 정보를 찾을 수 없습니다.');
    if (match.lost_post_user_id === requestingUserId) {
      myPostLabel = `내 분실물: ${match.lost_title}`;
      otherPostLabel = `상대 습득물: ${match.found_title}`;
      otherUserId = match.found_post_user_id;
      subjectPost = getPost('found', match.found_post_id);
    } else {
      myPostLabel = `내 습득물: ${match.found_title}`;
      otherPostLabel = `상대 분실물: ${match.lost_title}`;
      otherUserId = match.lost_post_user_id;
      subjectPost = getPost('lost', match.lost_post_id);
    }
    score = match.score;
  } else {
    const isLost = room.direct_lost_post_id !== null;
    const post = isLost
      ? getPost('lost', room.direct_lost_post_id)
      : getPost('found', room.direct_found_post_id);
    subjectPost = post;
    otherPostLabel = post ? `${isLost ? '찾아요' : '찾았어요'} 게시물: ${post.title}` : '삭제된 게시물';
    if (room.initiator_user_id === requestingUserId) {
      myPostLabel = '직접 문의한 채팅';
      otherUserId = post ? post.user_id : null;
    } else {
      myPostLabel = '내 게시물에 대한 문의';
      otherUserId = room.initiator_user_id;
    }
  }

  const otherUser = otherUserId ? getUserById(otherUserId) : null;
  const amLostSide = match ? match.lost_post_user_id === requestingUserId : false;

  return {
    id: room.id,
    roomType: room.match_id !== null ? 'match' : 'direct',
    myPostLabel,
    otherPostLabel,
    otherUserId,
    otherNickname: otherUser ? otherUser.nickname : '상대방',
    otherTrustScore: otherUser ? otherUser.trust_score : null,
    score,
    // 상단 물건 카드용 요약. 게시물이 삭제됐으면 null.
    subject: subjectPost ? {
      kind: subjectPost.kind,
      id: subjectPost.id,
      title: subjectPost.title,
      status: subjectPost.status,
      image: subjectPost.images[0] ?? null,
    } : null,
    // 되찾음 마무리 상태 (매칭 방에서만 의미가 있다)
    deal: match ? {
      matchId: match.match_id,
      completed: Boolean(match.completed_at),
      iConfirmed: Boolean(amLostSide ? match.lost_confirmed_at : match.found_confirmed_at),
      otherConfirmed: Boolean(amLostSide ? match.found_confirmed_at : match.lost_confirmed_at),
    } : null,
  };
}

// ---------------------------------------------------------------- 메시지 반응

export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

/**
 * 메시지에 이모지 반응을 달거나 뗀다(같은 걸 다시 누르면 취소).
 * 그 메시지가 속한 채팅방의 참여자만 가능하며, 권한 판단은 getChatRoom 이 한다.
 * 반환: { added: boolean }
 */
export function toggleMessageReaction(messageId, requestingUserId, emoji) {
  if (!ALLOWED_REACTIONS.includes(emoji)) throw new ValidationError('사용할 수 없는 이모지입니다.');
  const message = getMessage(messageId);
  if (!message) throw new ValidationError('메시지를 찾을 수 없습니다.');
  getChatRoom(message.chat_room_id, requestingUserId); // 참여자 확인
  requireNotSuspended(requestingUserId);

  const existing = db.prepare('SELECT id FROM MessageReaction WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(messageId, requestingUserId, emoji);
  if (existing) {
    db.prepare('DELETE FROM MessageReaction WHERE id = ?').run(existing.id);
    return { added: false };
  }
  db.prepare('INSERT INTO MessageReaction (message_id, user_id, emoji) VALUES (?, ?, ?)')
    .run(messageId, requestingUserId, emoji);
  return { added: true };
}

/**
 * 여러 메시지의 반응을 한 번에 모아 온다(메시지당 따로 조회하지 않기 위해).
 * 반환: Map<messageId, [{ emoji, count, mine }]>
 */
function fetchReactions(messageIds, requestingUserId) {
  if (!messageIds.length) return new Map();
  const qm = Array(messageIds.length).fill('?').join(',');
  const rows = db.prepare(`
    SELECT message_id, emoji, COUNT(*) AS count,
           SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
    FROM MessageReaction
    WHERE message_id IN (${qm})
    GROUP BY message_id, emoji
  `).all(requestingUserId, ...messageIds);

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.message_id)) map.set(r.message_id, []);
    map.get(r.message_id).push({ emoji: r.emoji, count: r.count, mine: r.mine > 0 });
  }
  return map;
}

/**
 * 커서 기반 페이지네이션(OFFSET 아님)으로 메시지를 오래된순으로 돌려준다.
 * beforeId 를 주면 그보다 id 가 작은(= 더 오래된) 메시지 중 최신 limit 개.
 * created_at 은 초 단위라 정렬의 2차 키는 항상 id DESC 다.
 * 관리자가 숨긴 메시지는 내용이 HIDDEN_MESSAGE_PLACEHOLDER 로 바뀌어 나간다
 * (실제 내용은 지우지 않는다 -- 관리자 화면에서는 원문이 보인다).
 */
export function listMessages(chatRoomId, requestingUserId, limit = MESSAGE_PAGE_SIZE, beforeId = null) {
  getChatRoom(chatRoomId, requestingUserId);
  if (!Number.isInteger(limit) || limit <= 0) throw new ValidationError(`invalid limit: ${limit}`);
  if (beforeId !== null && (!Number.isInteger(beforeId) || beforeId <= 0)) {
    throw new ValidationError(`invalid before_id: ${beforeId}`);
  }

  const conditions = ['m.chat_room_id = ?'];
  const params = [chatRoomId];
  if (beforeId !== null) { conditions.push('m.id < ?'); params.push(beforeId); }
  params.push(limit);

  const rows = db.prepare(`
    SELECT m.id, m.chat_room_id, m.sender_user_id, m.content, m.image_url,
           m.created_at, m.read_at, m.hidden_at,
           u.nickname AS sender_nickname
    FROM Message m JOIN User u ON u.id = m.sender_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ?
  `).all(...params);

  // 이모지 반응은 메시지마다 따로 묻지 않고 한 번에 모아 온다.
  const reactions = fetchReactions(rows.map((r) => r.id), requestingUserId);

  // DB는 최신순 -> 화면에 위에서 아래로 뿌리기 좋게 오래된순으로 뒤집는다.
  return rows.reverse().map((row) => ({
    ...row,
    content: row.hidden_at ? HIDDEN_MESSAGE_PLACEHOLDER : row.content,
    // 숨겨진 메시지는 사진도 함께 가린다.
    image_url: row.hidden_at ? null : row.image_url,
    reactions: reactions.get(row.id) ?? [],
  }));
}

export function getMessage(messageId) {
  return db.prepare('SELECT * FROM Message WHERE id = ?').get(messageId) ?? null;
}

/**
 * 보낸 사람은 언제나 검증된 요청자다 -- 클라이언트가 넘긴 id 를 쓰지 않는다.
 * 성공 시 *상대방에게만* 'message' 알림이 같은 트랜잭션으로 생성된다.
 * related_id 가 chat_room_id 가 아니라 새 message id 라서, 같은 방의 서로 다른
 * 메시지가 UNIQUE 제약에 걸려 뭉개지지 않는다.
 */
export function sendMessage(chatRoomId, requestingUserId, contentRaw, imageUrl = null) {
  const room = getChatRoom(chatRoomId, requestingUserId);
  requireNotSuspended(requestingUserId);

  let content = String(contentRaw ?? '').trim();
  // 사진만 보낼 수도 있다. 그때도 content 를 비워 두지 않는 이유는, 채팅 목록의
  // "마지막 메시지" 미리보기가 content 를 그대로 쓰기 때문이다.
  if (!content && imageUrl) content = '[사진]';
  if (!content) throw new ValidationError('빈 메시지는 보낼 수 없습니다.');

  const others = [...chatRoomParticipantIds(room)].filter((id) => id !== requestingUserId);
  const otherUserId = others.length ? others[0] : null;

  return db.transaction(() => {
    const messageId = db.prepare(
      'INSERT INTO Message (chat_room_id, sender_user_id, content, image_url) VALUES (?, ?, ?, ?)'
    ).run(chatRoomId, requestingUserId, content, imageUrl).lastInsertRowid;
    if (otherUserId !== null) {
      const sender = getUserById(requestingUserId);
      insertNotification(otherUserId, 'message', '새 메시지가 도착했습니다',
        `${sender.nickname}님이 메시지를 보냈습니다.`, 'message', messageId);
    }
    return getMessage(messageId);
  })();
}

/** 상대방이 보낸 안 읽은 메시지만 읽음 처리한다. 내 메시지는 건드리지 않는다. */
export function markMessagesAsRead(chatRoomId, requestingUserId) {
  getChatRoom(chatRoomId, requestingUserId);
  return db.prepare(`
    UPDATE Message SET read_at = datetime('now')
    WHERE chat_room_id = ? AND sender_user_id != ? AND read_at IS NULL
  `).run(chatRoomId, requestingUserId).changes;
}

/** 채팅방에 실제로 들어왔을 때, 그 방의 'message' 알림도 같이 읽음 처리한다. */
export function markMessageNotificationsAsReadForChatRoom(chatRoomId, requestingUserId) {
  getChatRoom(chatRoomId, requestingUserId);
  return db.prepare(`
    UPDATE Notification SET is_read = 1
    WHERE user_id = ? AND type = 'message' AND related_type = 'message' AND is_read = 0
      AND related_id IN (SELECT id FROM Message WHERE chat_room_id = ?)
  `).run(requestingUserId, chatRoomId).changes;
}

/**
 * 내가 참여 중인 모든 방(매칭/다이렉트)의 안 읽은 메시지 총합.
 * 매칭 방은 ma.* 가, 다이렉트 방은 cr.direct_* 가 채워지므로 COALESCE 한쪽만 기여한다.
 */
export function countUnreadMessagesByUser(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS unread_count
    FROM Message m
    JOIN ChatRoom cr ON cr.id = m.chat_room_id
    LEFT JOIN "Match" ma ON ma.id = cr.match_id
    LEFT JOIN LostPost lp ON lp.id = COALESCE(ma.lost_post_id, cr.direct_lost_post_id)
    LEFT JOIN FoundPost fp ON fp.id = COALESCE(ma.found_post_id, cr.direct_found_post_id)
    WHERE (lp.user_id = ? OR fp.user_id = ? OR cr.initiator_user_id = ?)
      AND m.sender_user_id != ? AND m.read_at IS NULL
  `).get(userId, userId, userId, userId).unread_count;
}

const CHAT_ROOM_LAST_MESSAGE_SUBQUERY = `
  SELECT id, chat_room_id, content, created_at, hidden_at,
         ROW_NUMBER() OVER (PARTITION BY chat_room_id ORDER BY created_at DESC, id DESC) AS rn
  FROM Message
`;

/**
 * 내가 참여 중인 채팅방 목록. 매칭 방과 다이렉트 방은 컬럼 모양이 달라서
 * 하나의 UNION 대신 두 쿼리로 조회한 뒤 JS 에서 합친다(원본과 동일한 판단).
 * 모든 행에 room_type / other_nickname / post_title 을 통일해 채워주므로
 * 화면 쪽은 종류별 분기 없이 카드 하나로 그릴 수 있다.
 * 마지막 메시지가 관리자에 의해 숨겨졌다면 미리보기도 같이 가려진다.
 */
export function listChatRoomsByUser(userId) {
  const matchRows = db.prepare(`
    SELECT cr.id AS chat_room_id, cr.match_id, cr.created_at AS chat_room_created_at,
           m.score AS score,
           lp.id AS lost_post_id, lp.user_id AS lost_post_user_id, lp.title AS lost_title,
           lu.nickname AS lost_user_nickname,
           fp.id AS found_post_id, fp.user_id AS found_post_user_id, fp.title AS found_title,
           fu.nickname AS found_user_nickname,
           lm.content AS last_message_content, lm.created_at AS last_message_created_at,
           lm.id AS last_message_id, lm.hidden_at AS last_message_hidden_at,
           (SELECT COUNT(*) FROM Message msg
             WHERE msg.chat_room_id = cr.id AND msg.sender_user_id != ? AND msg.read_at IS NULL) AS unread_count
    FROM ChatRoom cr
    JOIN "Match" m ON m.id = cr.match_id
    JOIN LostPost lp ON lp.id = m.lost_post_id
    JOIN FoundPost fp ON fp.id = m.found_post_id
    JOIN User lu ON lu.id = lp.user_id
    JOIN User fu ON fu.id = fp.user_id
    LEFT JOIN (${CHAT_ROOM_LAST_MESSAGE_SUBQUERY}) lm ON lm.chat_room_id = cr.id AND lm.rn = 1
    WHERE lp.user_id = ? OR fp.user_id = ?
  `).all(userId, userId, userId);

  const directRows = db.prepare(`
    SELECT cr.id AS chat_room_id, cr.created_at AS chat_room_created_at,
           cr.initiator_user_id, iu.nickname AS initiator_nickname,
           COALESCE(dlp.title, dfp.title) AS direct_post_title,
           COALESCE(dlp.user_id, dfp.user_id) AS direct_post_owner_id,
           ou.nickname AS direct_post_owner_nickname,
           lm.content AS last_message_content, lm.created_at AS last_message_created_at,
           lm.id AS last_message_id, lm.hidden_at AS last_message_hidden_at,
           (SELECT COUNT(*) FROM Message msg
             WHERE msg.chat_room_id = cr.id AND msg.sender_user_id != ? AND msg.read_at IS NULL) AS unread_count
    FROM ChatRoom cr
    LEFT JOIN LostPost dlp ON dlp.id = cr.direct_lost_post_id
    LEFT JOIN FoundPost dfp ON dfp.id = cr.direct_found_post_id
    JOIN User iu ON iu.id = cr.initiator_user_id
    LEFT JOIN User ou ON ou.id = COALESCE(dlp.user_id, dfp.user_id)
    LEFT JOIN (${CHAT_ROOM_LAST_MESSAGE_SUBQUERY}) lm ON lm.chat_room_id = cr.id AND lm.rn = 1
    WHERE cr.match_id IS NULL AND (cr.initiator_user_id = ? OR dlp.user_id = ? OR dfp.user_id = ?)
  `).all(userId, userId, userId, userId);

  const results = [];
  for (const row of matchRows) {
    const item = { ...row, room_type: 'match' };
    if (item.lost_post_user_id === userId) {
      item.other_user_id = item.found_post_user_id;
      item.other_nickname = item.found_user_nickname;
    } else {
      item.other_user_id = item.lost_post_user_id;
      item.other_nickname = item.lost_user_nickname;
    }
    results.push(item);
  }
  for (const row of directRows) {
    const item = { ...row, room_type: 'direct' };
    // 게시물이 삭제됐는데 아직 CASCADE 되지 않은 아주 짧은 경합 구간 방어.
    item.post_title = item.direct_post_title || '삭제된 게시물';
    if (item.initiator_user_id === userId) {
      item.other_user_id = item.direct_post_owner_id;
      item.other_nickname = item.direct_post_owner_nickname || '상대방';
    } else {
      item.other_user_id = item.initiator_user_id;
      item.other_nickname = item.initiator_nickname;
    }
    results.push(item);
  }
  for (const item of results) {
    if (item.last_message_hidden_at) item.last_message_content = HIDDEN_MESSAGE_PLACEHOLDER;
  }

  // 마지막 메시지 최신순, 메시지가 없는 방은 그 뒤에 방 생성일 최신순.
  const withMsg = results.filter((i) => i.last_message_created_at !== null);
  const withoutMsg = results.filter((i) => i.last_message_created_at === null);
  withMsg.sort((a, b) => (
    b.last_message_created_at.localeCompare(a.last_message_created_at)
    || (b.last_message_id || 0) - (a.last_message_id || 0)
  ));
  withoutMsg.sort((a, b) => b.chat_room_created_at.localeCompare(a.chat_room_created_at));
  return [...withMsg, ...withoutMsg];
}

// ---------------------------------------------------------------- Report

/**
 * target_type="post" 은 LostPost/FoundPost 를 구분하지 않는 스키마다.
 * 두 테이블의 id 는 각각 1부터 시작하는 별개 시퀀스라 같은 숫자가 서로 다른
 * 게시물을 가리키는 게 흔한 일이므로, 부호로 어느 테이블인지 인코딩한다:
 *   양수 target_id = LostPost id,  음수 target_id = -(FoundPost id)
 */
function validateReportTarget(targetType, targetId, reporterUserId) {
  if (targetType === 'post') {
    let post = null;
    if (targetId > 0) post = getPost('lost', targetId);
    else if (targetId < 0) post = getPost('found', -targetId);
    if (!post) throw new ValidationError('신고 대상 게시물을 찾을 수 없습니다.');
    if (post.user_id === reporterUserId) throw new ValidationError('자신이 작성한 게시물은 신고할 수 없습니다.');
  } else if (targetType === 'message') {
    const message = getMessage(targetId);
    if (!message) throw new ValidationError('신고 대상 메시지를 찾을 수 없습니다.');
    if (message.sender_user_id === reporterUserId) throw new ValidationError('자신이 보낸 메시지는 신고할 수 없습니다.');
  } else {
    const targetUser = getUserById(targetId);
    if (!targetUser) throw new ValidationError('신고 대상 사용자를 찾을 수 없습니다.');
    if (targetId === reporterUserId) throw new ValidationError('자기 자신을 신고할 수 없습니다.');
  }
}

/** 신고 접수. 검증은 전부 여기서 한다(화면 쪽에 중복 로직을 두지 않는다). */
export function createReport(reporterUserId, targetType, targetId, reasonRaw, detailRaw = null) {
  if (!getUserById(reporterUserId)) throw new ValidationError(`User ${reporterUserId} not found`);
  if (!REPORT_TARGET_TYPES.has(targetType)) throw new ValidationError(`invalid target_type: ${targetType}`);

  const reason = String(reasonRaw ?? '').trim();
  if (!reason) throw new ValidationError('신고 사유를 입력해주세요.');
  const detail = String(detailRaw ?? '').trim() || null;

  validateReportTarget(targetType, targetId, reporterUserId);

  const existing = db.prepare(
    'SELECT id FROM Report WHERE reporter_user_id = ? AND target_type = ? AND target_id = ?'
  ).get(reporterUserId, targetType, targetId);
  if (existing) throw new ValidationError('이미 신고한 대상입니다.');

  try {
    return db.prepare(
      'INSERT INTO Report (reporter_user_id, target_type, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
    ).run(reporterUserId, targetType, targetId, reason, detail).lastInsertRowid;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError('이미 신고한 대상입니다.');
    throw e;
  }
}

export function getReport(reportId) {
  return db.prepare('SELECT * FROM Report WHERE id = ?').get(reportId) ?? null;
}

// ---------------------------------------------------------------- Admin

/** DB에서 매번 다시 읽는 관리자 확인. 화면/세션이 주장하는 값은 절대 믿지 않는다. */
export function isAdmin(userId) {
  const user = getUserById(userId);
  return Boolean(user && user.is_admin);
}

function requireAdmin(requestingUserId) {
  const user = getUserById(requestingUserId);
  if (!user) throw new PermissionDeniedError('Admin check failed: user not found');
  if (!user.is_admin) throw new PermissionDeniedError('관리자 권한이 필요합니다.');
}

/** 신고 목록 한 페이지의 대상들을 테이블별 IN 쿼리 한 번씩으로 모아 온다(N+1 방지). */
function batchFetchReportTargets(reports) {
  const lostIds = new Set();
  const foundIds = new Set();
  const messageIds = new Set();
  const userIds = new Set();
  for (const r of reports) {
    if (r.target_type === 'post') {
      if (r.target_id > 0) lostIds.add(r.target_id); else foundIds.add(-r.target_id);
    } else if (r.target_type === 'message') messageIds.add(r.target_id);
    else userIds.add(r.target_id);
  }
  const toMap = (rows) => new Map(rows.map((row) => [row.id, row]));
  const qm = (s) => Array(s.size).fill('?').join(',');

  return {
    lost: lostIds.size ? toMap(db.prepare(
      `SELECT lp.*, u.nickname AS author_nickname FROM LostPost lp JOIN User u ON u.id = lp.user_id
       WHERE lp.id IN (${qm(lostIds)})`).all(...lostIds)) : new Map(),
    found: foundIds.size ? toMap(db.prepare(
      `SELECT fp.*, u.nickname AS author_nickname FROM FoundPost fp JOIN User u ON u.id = fp.user_id
       WHERE fp.id IN (${qm(foundIds)})`).all(...foundIds)) : new Map(),
    message: messageIds.size ? toMap(db.prepare(
      `SELECT m.*, u.nickname AS sender_nickname FROM Message m JOIN User u ON u.id = m.sender_user_id
       WHERE m.id IN (${qm(messageIds)})`).all(...messageIds)) : new Map(),
    user: userIds.size ? toMap(db.prepare(
      `SELECT * FROM User WHERE id IN (${qm(userIds)})`).all(...userIds)) : new Map(),
  };
}

/** 신고 1건의 관리자용 대상 요약. 대상이 이미 삭제됐으면 null. 닉네임만 노출한다. */
function reportTargetInfo(report, maps) {
  if (report.target_type === 'post') {
    const isLost = report.target_id > 0;
    const post = isLost ? maps.lost.get(report.target_id) : maps.found.get(-report.target_id);
    if (!post) return null;
    return {
      post_kind: isLost ? 'lost' : 'found',
      title: post.title,
      description: post.description,
      category: post.category,
      location: post.location,
      status: post.status,
      author_nickname: post.author_nickname,
      created_at: post.created_at,
    };
  }
  if (report.target_type === 'message') {
    const msg = maps.message.get(report.target_id);
    if (!msg) return null;
    return {
      content: msg.content,
      sender_nickname: msg.sender_nickname,
      created_at: msg.created_at,
      chat_room_id: msg.chat_room_id,
    };
  }
  const user = maps.user.get(report.target_id);
  return user ? { nickname: user.nickname } : null;
}

function batchFetchModerationActions(reportIds) {
  if (!reportIds.length) return new Map();
  const qm = Array(reportIds.length).fill('?').join(',');
  const rows = db.prepare(
    `SELECT ma.*, u.nickname AS admin_nickname FROM ModerationAction ma
     JOIN User u ON u.id = ma.admin_user_id WHERE ma.report_id IN (${qm})`
  ).all(...reportIds);
  return new Map(rows.map((r) => [r.report_id, r]));
}

export function getModerationActionForReport(reportId) {
  return db.prepare('SELECT * FROM ModerationAction WHERE report_id = ?').get(reportId) ?? null;
}

/**
 * 관리자 전용 신고 목록. 정렬은 항상 처리 대기 먼저, 그 안에서 최신순.
 * 대상 요약(target_info)/조치 내역은 배치 조회라 신고당 추가 쿼리가 없다.
 */
export function listReportsForAdmin(requestingAdminUserId, {
  status = null, targetType = null, limit = 50, offset = 0,
} = {}) {
  requireAdmin(requestingAdminUserId);
  if (status !== null && !REPORT_STATUSES.has(status)) throw new ValidationError(`invalid status: ${status}`);
  if (targetType !== null && !REPORT_TARGET_TYPES.has(targetType)) {
    throw new ValidationError(`invalid target_type: ${targetType}`);
  }

  const conditions = [];
  const params = [];
  if (status !== null) { conditions.push('r.status = ?'); params.push(status); }
  if (targetType !== null) { conditions.push('r.target_type = ?'); params.push(targetType); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT r.*, ru.nickname AS reporter_nickname, pu.nickname AS processed_by_nickname
    FROM Report r
    JOIN User ru ON ru.id = r.reporter_user_id
    LEFT JOIN User pu ON pu.id = r.processed_by_user_id
    ${where}
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const maps = batchFetchReportTargets(rows);
  const actions = batchFetchModerationActions(rows.map((r) => r.id));

  return rows.map((row) => {
    const targetInfo = reportTargetInfo(row, maps);
    return {
      ...row,
      target_deleted: targetInfo === null,
      target_info: targetInfo,
      moderation_action: actions.get(row.id) ?? null,
    };
  });
}

/**
 * 관리자의 검토 결정을 기록한다(제재 없이 반려/처리만).
 * 'pending' 상태에서만 가능하고, 검사+갱신을 하나의 원자적 UPDATE 로 처리해 경합에 안전하다.
 * processed_by_user_id 는 언제나 요청한 관리자 본인이다.
 */
export function processReport(reportId, requestingAdminUserId, status, adminNoteRaw = null) {
  requireAdmin(requestingAdminUserId);
  const report = getReport(reportId);
  if (!report) throw new ValidationError(`Report ${reportId} not found`);
  if (status !== 'dismissed' && status !== 'actioned') throw new ValidationError(`invalid status: ${status}`);
  const adminNote = String(adminNoteRaw ?? '').trim() || null;

  db.transaction(() => {
    const info = db.prepare(`
      UPDATE Report SET status = ?, processed_at = datetime('now'),
                        processed_by_user_id = ?, admin_note = ?
      WHERE id = ? AND status = 'pending'
    `).run(status, requestingAdminUserId, adminNote, reportId);
    if (info.changes === 0) throw new ValidationError('이미 처리된 신고입니다.');

    const content = status === 'dismissed'
      ? '신고하신 내용이 관리자에 의해 반려되었습니다.'
      : '신고하신 내용이 관리자 조치로 처리되었습니다.';
    insertNotification(report.reporter_user_id, 'report_processed',
      '신고 처리 결과가 등록되었습니다', content, 'report', reportId);
  })();
}

/**
 * 신고를 'actioned' 로 처리하면서 실제 제재(게시물 삭제 / 메시지 숨김 / 사용자 정지)까지
 * 하나의 트랜잭션으로 적용한다 -- 둘 다 되거나, 둘 다 안 된다.
 * actionType 은 report.target_type 과 짝이 맞아야 한다(post -> delete_post 등).
 * suspendDurationDays: suspend_user 전용. null 이면 영구 정지.
 */
export function applyReportAction(reportId, requestingAdminUserId, {
  actionType, actionReason = null, adminNote = null, suspendDurationDays = null,
} = {}) {
  requireAdmin(requestingAdminUserId);
  const report = getReport(reportId);
  if (!report) throw new ValidationError(`Report ${reportId} not found`);
  if (!MODERATION_ACTION_TYPES.has(actionType)) throw new ValidationError(`invalid action_type: ${actionType}`);
  if (!TARGET_TYPE_TO_ACTION_TYPES[report.target_type]?.has(actionType)) {
    throw new ValidationError(`${actionType} 은(는) ${report.target_type} 신고에 적용할 수 없습니다.`);
  }
  if (report.status !== 'pending') throw new ValidationError('이미 처리된 신고입니다.');
  if (getModerationActionForReport(reportId)) throw new ValidationError('이미 이 신고에 대한 조치가 존재합니다.');
  if (suspendDurationDays !== null
      && (!Number.isInteger(suspendDurationDays) || suspendDurationDays <= 0)) {
    throw new ValidationError(`invalid suspend_duration_days: ${suspendDurationDays}`);
  }

  const reason = String(actionReason ?? '').trim() || null;
  const note = String(adminNote ?? '').trim() || null;
  const { target_type: targetType, target_id: targetId } = report;

  try {
    return db.transaction(() => {
      let expiresAt = null;
      // 제재를 받은 당사자. 신고가 인용됐다는 뜻이므로 아래에서 명지도를 깎는다.
      let penalizedUserId = null;

      if (targetType === 'post') {
        const table = targetId > 0 ? 'LostPost' : 'FoundPost';
        const realId = targetId > 0 ? targetId : -targetId;
        const row = db.prepare(`SELECT id, user_id FROM ${table} WHERE id = ?`).get(realId);
        if (!row) throw new ValidationError('대상 게시물이 이미 삭제되었습니다.');
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(realId);
        penalizedUserId = row.user_id;
        insertNotification(row.user_id, 'post_deleted', '게시물이 삭제되었습니다',
          '신고 접수된 게시물이 관리자 조치로 삭제되었습니다.', 'report', reportId);
      } else if (targetType === 'message') {
        const row = db.prepare('SELECT id, sender_user_id FROM Message WHERE id = ?').get(targetId);
        if (!row) throw new ValidationError('대상 메시지가 이미 삭제되었습니다.');
        db.prepare(`
          UPDATE Message SET hidden_at = datetime('now'), hidden_by_user_id = ?, hidden_reason = ?
          WHERE id = ?
        `).run(requestingAdminUserId, reason, targetId);
        penalizedUserId = row.sender_user_id;
        insertNotification(row.sender_user_id, 'message_hidden', '메시지가 숨김 처리되었습니다',
          '작성하신 메시지가 관리자 조치로 숨김 처리되었습니다.', 'report', reportId);
      } else { // user
        const row = db.prepare('SELECT id FROM User WHERE id = ?').get(targetId);
        if (!row) throw new ValidationError('대상 사용자를 찾을 수 없습니다.');
        let suspendDesc = '영구 정지되었습니다.';
        if (suspendDurationDays !== null) {
          expiresAt = db.prepare("SELECT datetime('now', ?) AS until")
            .get(`+${suspendDurationDays} days`).until;
          suspendDesc = `${suspendDurationDays}일 정지되었습니다.`;
        }
        db.prepare('UPDATE User SET is_suspended = 1, suspended_until = ? WHERE id = ?')
          .run(expiresAt, targetId);
        penalizedUserId = targetId;
        insertNotification(targetId, 'user_suspended', '계정 정지 안내',
          `계정이 ${suspendDesc}`, 'report', reportId);
      }

      const moderationActionId = db.prepare(`
        INSERT INTO ModerationAction
          (report_id, target_type, target_id, action_type, reason, admin_user_id, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportId, targetType, targetId, actionType, reason, requestingAdminUserId, expiresAt)
        .lastInsertRowid;

      const info = db.prepare(`
        UPDATE Report SET status = 'actioned', processed_at = datetime('now'),
                          processed_by_user_id = ?, admin_note = ?
        WHERE id = ? AND status = 'pending'
      `).run(requestingAdminUserId, note, reportId);
      if (info.changes === 0) throw new ValidationError('이미 처리된 신고입니다.');

      insertNotification(report.reporter_user_id, 'report_processed',
        '신고 처리 결과가 등록되었습니다', '신고하신 내용이 관리자 조치로 처리되었습니다.', 'report', reportId);

      // 신고가 '기각'이 아니라 실제 조치로 이어졌으므로 대상자의 명지도를 깎는다.
      // 이 트랜잭션이 롤백되면 감점도 함께 사라지고, 신고 1건당 조치는 하나뿐이므로
      // (ModerationAction.report_id UNIQUE) 같은 신고로 두 번 깎이지 않는다.
      if (penalizedUserId !== null) {
        adjustTrust(penalizedUserId, -TRUST_REPORT_PENALTY, '명지도가 내려갔습니다',
          `신고에 대한 관리자 조치가 이루어져 명지도가 ${TRUST_REPORT_PENALTY}%p 내려갔습니다.`,
          'report', reportId);
      }

      return moderationActionId;
    })();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError('이미 이 신고에 대한 조치가 존재합니다.');
    throw e;
  }
}

// ---------------------------------------------------------------- Notification

/**
 * 알림 한 줄 삽입. 호출자가 이미 열어 둔 트랜잭션 안에서 실행되도록 설계됐다
 * -- 알림은 그것을 만든 "진짜 사건"(메시지 발송 / 매칭 / 신고 처리)과 함께
 * 커밋되거나 함께 롤백된다. 그래서 sendMessage / createMatch / processReport /
 * applyReportAction 네 곳만 이 함수를 쓴다.
 * 중복(UNIQUE 충돌)은 예외가 아니라 no-op 으로 처리하고 기존 id 를 돌려준다.
 */
function insertNotification(userId, notificationType, titleRaw, contentRaw, relatedType = null, relatedId = null) {
  if (!NOTIFICATION_TYPES.has(notificationType)) {
    throw new ValidationError(`invalid notification_type: ${notificationType}`);
  }
  const title = String(titleRaw ?? '').trim();
  if (!title) throw new ValidationError('notification title must not be blank');
  const content = String(contentRaw ?? '').trim();
  if (!content) throw new ValidationError('notification content must not be blank');
  if ((relatedType === null) !== (relatedId === null)) {
    throw new ValidationError('related_type 과 related_id 는 둘 다 있거나 둘 다 없어야 합니다.');
  }
  try {
    return db.prepare(`
      INSERT INTO Notification (user_id, type, title, content, related_type, related_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, notificationType, title, content, relatedType, relatedId).lastInsertRowid;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = db.prepare(`
      SELECT id FROM Notification WHERE user_id = ? AND type = ? AND related_type = ? AND related_id = ?
    `).get(userId, notificationType, relatedType, relatedId);
    return existing ? existing.id : null;
  }
}

/**
 * "찾으시던 물건이 올라왔어요" 알림.
 *
 * related 를 습득 게시물 쪽으로 잡아서, 같은 습득물에 대해 한 사람에게는
 * 한 번만 알림이 간다(Notification 의 UNIQUE 제약이 중복을 걸러 준다).
 * 알림 하나가 실패해도 나머지 사람에게는 계속 가도록 예외를 삼킨다.
 */
export function createAutoMatchNotification(userId, foundPost, lostPost) {
  try {
    insertNotification(userId, 'match', '찾으시던 물건이 올라왔어요',
      `'${lostPost.title}'와(과) 비슷한 습득물 '${foundPost.title}'이(가) 등록되었습니다.`,
      'found_post', foundPost.id);
  } catch (e) {
    console.error('[automatch] 알림 생성 실패', e);
  }
}

export function getNotification(notificationId) {
  return db.prepare('SELECT * FROM Notification WHERE id = ?').get(notificationId) ?? null;
}

export function listNotificationsByUser(userId, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT id, user_id, type, title, content, related_type, related_id, is_read, created_at
    FROM Notification WHERE user_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

export function countUnreadNotifications(userId) {
  return db.prepare('SELECT COUNT(*) AS unread_count FROM Notification WHERE user_id = ? AND is_read = 0')
    .get(userId).unread_count;
}

/** 내 알림만 읽음 처리. 명시적 소유권 확인 + UPDATE 의 WHERE 로 이중 방어. */
export function markNotificationAsRead(notificationId, requestingUserId) {
  const notification = getNotification(notificationId);
  if (!notification) throw new ValidationError('알림을 찾을 수 없습니다.');
  if (notification.user_id !== requestingUserId) {
    throw new PermissionDeniedError('본인의 알림만 확인할 수 있습니다.');
  }
  db.prepare('UPDATE Notification SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(notificationId, requestingUserId);
}

export function markAllNotificationsAsRead(requestingUserId) {
  return db.prepare('UPDATE Notification SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(requestingUserId).changes;
}

// ---------------------------------------------------------------- 관리자 통계

/**
 * 관리자 대시보드용 숫자 묶음. 전부 COUNT 라서 가볍다.
 * 관리자 확인은 여기서도 다시 한다(라우터를 믿지 않는다).
 */
export function getAdminStats(requestingAdminUserId) {
  requireAdmin(requestingAdminUserId);
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;

  return {
    users: {
      total: count('SELECT COUNT(*) c FROM User'),
      withNickname: count('SELECT COUNT(*) c FROM User WHERE nickname IS NOT NULL'),
      admins: count('SELECT COUNT(*) c FROM User WHERE is_admin = 1'),
      suspended: count('SELECT COUNT(*) c FROM User WHERE is_suspended = 1'),
      newToday: count("SELECT COUNT(*) c FROM User WHERE created_at >= date('now')"),
    },
    posts: {
      lost: count('SELECT COUNT(*) c FROM LostPost'),
      lostOpen: count("SELECT COUNT(*) c FROM LostPost WHERE status = '찾는 중'"),
      found: count('SELECT COUNT(*) c FROM FoundPost'),
      foundOpen: count("SELECT COUNT(*) c FROM FoundPost WHERE status = '보관 중'"),
      newToday: count("SELECT COUNT(*) c FROM LostPost WHERE created_at >= date('now')")
        + count("SELECT COUNT(*) c FROM FoundPost WHERE created_at >= date('now')"),
    },
    matches: {
      total: count('SELECT COUNT(*) c FROM "Match"'),
      completed: count('SELECT COUNT(*) c FROM "Match" WHERE completed_at IS NOT NULL'),
    },
    chats: {
      rooms: count('SELECT COUNT(*) c FROM ChatRoom'),
      messages: count('SELECT COUNT(*) c FROM Message'),
    },
    reports: {
      pending: count("SELECT COUNT(*) c FROM Report WHERE status = 'pending'"),
      actioned: count("SELECT COUNT(*) c FROM Report WHERE status = 'actioned'"),
      dismissed: count("SELECT COUNT(*) c FROM Report WHERE status = 'dismissed'"),
    },
    comments: count('SELECT COUNT(*) c FROM Comment'),
  };
}
