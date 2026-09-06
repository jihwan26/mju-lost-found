/**
 * AI 의미 검색 / AI 매칭 추천.
 * 실제 유사도 계산은 BE/ai.js 가 하고, 여기서는 후보를 모아 넘기고 결과를 돌려준다.
 */
import express from 'express';
import fs from 'node:fs';

import * as db from '../db.js';
import * as ai from '../ai.js';
import * as auth from '../auth.js';
import { filterValue, intOrNull, wrap } from '../helpers.js';
import { upload } from '../upload.js';
import { describeImage } from '../vision.js';

const router = express.Router();

/**
 * AI 의미 검색 -- 자유 문장으로 *반대편* 게시판을 찾는다.
 * (찾아요 화면에서 검색하면 습득물이, 찾았어요 화면에서 검색하면 분실물이 나온다.)
 * 원본 pages/1,2 의 "AI 의미 검색" 탭과 같은 동작.
 */
router.post('/ai/search', wrap(async (req, res) => {
  if (!auth.requireReadyUser(req, res)) return;
  const targetKind = req.body?.kind === 'lost' ? 'lost' : 'found';
  const candidates = db.searchPosts(targetKind, {
    category: filterValue(req.body?.category),
    status: filterValue(req.body?.status),
    campus: filterValue(req.body?.campus),
  });
  const results = await ai.searchSimilarPosts(req.body?.query, candidates, ai.SEARCH_TOP_K);
  res.json({ kind: targetKind, results });
}));

/**
 * 게시물 상세의 "🤖 AI로 유사한 OO 찾기".
 * 내 게시물과 의미가 비슷한 반대편 게시물 상위 5건을 돌려준다.
 */
router.post('/ai/match', wrap(async (req, res) => {
  if (!auth.requireReadyUser(req, res)) return;
  const kind = req.body?.kind === 'found' ? 'found' : 'lost';
  const post = db.getPost(kind, intOrNull(req.body?.postId));
  if (!post) throw new db.ValidationError('게시물을 찾을 수 없습니다.');

  // 유사 게시물은 같은 캠퍼스 안에서만 찾는다.
  const candidateKind = kind === 'lost' ? 'found' : 'lost';
  const candidates = db.searchPosts(candidateKind, { campus: post.campus });
  const results = await ai.rankSimilarPosts(post, candidates, 5);
  res.json({ kind: candidateKind, results });
}));

/**
 * 사진으로 검색.
 *
 * 사진을 벡터로 직접 비교하지 않고, 사진을 한국어 검색어로 바꾼 뒤
 * 기존 의미 검색을 그대로 태운다. 게시물이 글로 쓰여 있어서 글끼리
 * 비교하는 편이 정확하고, 랭킹 로직을 새로 만들 필요도 없다.
 *
 * 응답에 caption 을 함께 돌려주므로, 사용자가 "AI가 사진을 이렇게 읽었구나"를
 * 보고 검색어를 직접 고쳐 다시 시도할 수 있다.
 */
router.post('/ai/image-search', upload.single('image'), wrap(async (req, res) => {
  if (!auth.requireReadyUser(req, res)) return;
  if (!req.file) throw new db.ValidationError('사진을 선택해주세요.');

  const buffer = await fs.promises.readFile(req.file.path);
  // 검색에만 쓰고 보관하지 않는다. 실패해도 검색 결과에는 영향이 없다.
  fs.promises.unlink(req.file.path).catch(() => {});

  const caption = await describeImage(buffer);

  const targetKind = req.body?.kind === 'lost' ? 'lost' : 'found';
  const candidates = db.searchPosts(targetKind, {
    category: filterValue(req.body?.category),
    status: filterValue(req.body?.status),
    campus: filterValue(req.body?.campus),
  });
  const results = await ai.searchSimilarPosts(caption, candidates, ai.SEARCH_TOP_K);
  res.json({ kind: targetKind, caption, results });
}));

export default router;
