/**
 * 사진 -> 한국어 검색어 (이미지 기반 검색용).
 *
 * 사진 자체를 벡터로 비교하지 않고, "사진을 한국어 문장으로 설명하게 한 뒤
 * 그 문장으로 기존 의미 검색을 태우는" 방식이다. 게시물은 어차피 글로 쓰여 있으므로
 * 글끼리 비교하는 편이 정확하고, ai.js 의 검색 로직을 그대로 재사용할 수 있다.
 *
 *   사진 → (Vision 모델) → "검은색 무선 이어폰 충전 케이스" → 기존 의미 검색
 *
 * 백엔드는 Cloudflare Workers AI 다. 무료 티어가 있고 키 두 개만 있으면 되며,
 * 설정이 없으면 기능만 조용히 꺼진다(다른 기능은 영향 없음).
 *
 * 필요한 환경변수:
 *   CF_ACCOUNT_ID   Cloudflare 대시보드 우측의 Account ID
 *   CF_API_TOKEN    Workers AI 읽기 권한이 있는 API 토큰
 */

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const API_TOKEN = process.env.CF_API_TOKEN || '';
const MODEL = process.env.VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';

/** 사진 검색을 쓸 수 있는 상태인지. 화면에서 버튼을 감출지 결정하는 데 쓴다. */
export function isVisionConfigured() {
  return Boolean(ACCOUNT_ID && API_TOKEN);
}

export class VisionUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'VisionUnavailableError'; this.status = 503; }
}

// 모델에게 "설명문"이 아니라 "검색어"를 달라고 못박는다. 문장으로 받으면
// 조사·서술어 때문에 의미 검색 점수가 오히려 흐려진다.
const PROMPT = [
  '이 사진에 있는 물건을 한국어 검색 키워드로만 적어줘.',
  '형식: 색상, 종류, 브랜드나 특징을 쉼표로 구분한 짧은 명사구.',
  '설명 문장, 마크다운, 따옴표, "사진에는" 같은 도입부는 절대 쓰지 마.',
  '확실하지 않은 브랜드명은 지어내지 마.',
  '예: 검은색, 무선 이어폰, 충전 케이스',
].join(' ');

/**
 * 모델이 뱉은 잡소리를 걷어내고 검색어만 남긴다.
 * 실제로 자주 섞여 나오는 것들: 마크다운 기호, 따옴표, "사진에는~" 도입부,
 * 여러 줄 나열. 이걸 그대로 검색에 넣으면 점수가 엉망이 되므로 여기서 정리한다.
 */
export function cleanCaption(raw) {
  let text = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')   // 코드블록
    .replace(/[*_#>`"'\[\]]/g, ' ')    // 마크다운/따옴표
    .replace(/\r?\n+/g, ', ')          // 줄바꿈 -> 쉼표
    .replace(/\s+/g, ' ')
    .trim();

  // "이 사진에는 ...가 있습니다" 같은 도입/맺음말 제거.
  // 맺음말 앞의 조사(이/가/은/는...)까지 같이 떼야 "텀블러가" 대신 "텀블러"가 남는다.
  // 조사는 이 자리(맺음말 바로 앞)에서만 떼기 때문에, '국가'·'추가'처럼 끝 글자가
  // 우연히 조사와 같은 단어를 잘라먹지 않는다.
  text = text
    .replace(/^(이\s*)?(사진|이미지)(에는|에|은|는|의)?\s*/g, '')
    .replace(/(이|가|은|는|을|를)?\s*(있습니다|있어요|입니다|습니다|이에요|예요|이다)[.。]?\s*$/g, '')
    .trim();

  // 쉼표로 끊어 짧은 조각만 남긴다(문장이 통째로 들어오는 걸 막는다).
  const parts = text.split(/[,·]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length <= 25);

  return parts.slice(0, 8).join(' ').slice(0, 120);
}

/**
 * 이미지 바이트 -> 한국어 검색어.
 * 설정이 없거나 모델이 실패하면 VisionUnavailableError 를 던진다.
 * 호출부는 이걸 잡아서 "지금은 사진 검색을 쓸 수 없다"고 안내해야 한다.
 */
export async function describeImage(buffer) {
  if (!isVisionConfigured()) {
    throw new VisionUnavailableError(
      '사진 검색이 설정되지 않았습니다. 환경변수 CF_ACCOUNT_ID / CF_API_TOKEN 을 확인해주세요.'
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // Workers AI 의 vision 모델은 이미지를 바이트 배열로 받는다.
      body: JSON.stringify({
        image: [...new Uint8Array(buffer)],
        prompt: PROMPT,
        max_tokens: 128,
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new VisionUnavailableError(`사진 분석 요청이 실패했습니다: ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new VisionUnavailableError(`사진 분석에 실패했습니다 (${res.status}). ${body.slice(0, 200)}`);
  }

  const json = await res.json().catch(() => null);
  // 응답 모양이 모델마다 조금씩 다르다. 흔한 위치를 순서대로 훑는다.
  const raw = json?.result?.response ?? json?.result?.description ?? json?.result?.text ?? '';
  const caption = cleanCaption(raw);
  if (!caption) {
    throw new VisionUnavailableError('사진에서 검색어를 뽑지 못했습니다. 다른 사진으로 시도해보세요.');
  }
  return caption;
}
