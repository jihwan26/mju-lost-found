/**
 * 실시간 알림 (Server-Sent Events).
 *
 * 왜 WebSocket 이 아니라 SSE 인가:
 *   - 서버 -> 클라이언트 한 방향이면 충분하다(보내기는 기존 POST 를 그대로 쓴다)
 *   - 추가 패키지가 필요 없다. 그냥 끊지 않는 HTTP 응답이다
 *   - 프록시/HTTPS 환경에서 업그레이드 협상 문제가 없다(Railway 에서 그대로 동작)
 *   - 브라우저 EventSource 가 끊기면 알아서 재접속한다
 *
 * 한계: 구독자를 이 프로세스의 메모리에 들고 있으므로 서버가 여러 대로 늘어나면
 * 다른 인스턴스의 이벤트는 받지 못한다. 지금은 서버가 하나뿐이라 문제가 없고,
 * 늘어나더라도 클라이언트가 폴링을 함께 돌리고 있어 메시지를 잃지는 않는다.
 */

// userId -> Set<res>  (한 사람이 여러 탭을 열 수 있으므로 Set)
const subscribers = new Map();

/** 이 응답 객체를 SSE 스트림으로 만들고 구독자로 등록한다. */
export function subscribe(userId, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx 등 중간 프록시가 응답을 모아뒀다 보내지 않도록.
    'X-Accel-Buffering': 'no',
  });
  // 연결 직후 한 줄 흘려보내야 브라우저가 "열렸다"고 인식한다.
  res.write(': connected\n\n');

  if (!subscribers.has(userId)) subscribers.set(userId, new Set());
  subscribers.get(userId).add(res);

  // 프록시가 조용한 연결을 끊지 않도록 주기적으로 주석 줄을 보낸다.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { cleanup(); }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    const set = subscribers.get(userId);
    if (set) {
      set.delete(res);
      if (!set.size) subscribers.delete(userId);
    }
  }

  res.on('close', cleanup);
  res.on('error', cleanup);
}

/**
 * 특정 사용자들에게 이벤트를 보낸다.
 * 끊어진 연결에 쓰다 실패해도 나머지 전송을 막지 않는다.
 */
export function publish(userIds, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
  for (const userId of new Set(userIds)) {
    const set = subscribers.get(userId);
    if (!set) continue;
    for (const res of set) {
      try { res.write(payload); } catch { /* 끊어진 연결 -- close 핸들러가 정리한다 */ }
    }
  }
}

/** 지금 붙어 있는 연결 수 (진단용). */
export function subscriberCount() {
  let n = 0;
  for (const set of subscribers.values()) n += set.size;
  return n;
}
