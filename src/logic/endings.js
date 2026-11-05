// The four endings (D80). Trust is never shown; only the ending says what the player's choices meant.

export const ENDINGS = {
  discern: {
    name: '분별',
    lines: ['당신은 목소리가 언제 거짓을 말하는지 알아챘다.', '믿을 말만 골라 들은 끝에, 출구가 열렸다.', '스피커가 잠시 침묵한다. 처음으로, 그것이 당신을 두려워한다.'],
  },
  alone: {
    name: '혼자 걷다',
    lines: ['당신은 그 목소리를 거의 믿지 않았다.', '혼자 힘으로 출구에 닿았지만, 그것이 무엇이었는지는 끝내 모른다.', '문이 닫히고, 스피커가 조용히 꺼진다.'],
  },
  half: {
    name: '반쪽의 목소리',
    lines: ['어떤 말은 믿었고, 어떤 말은 흘려들었다.', '살아서 나왔지만, 어디까지가 진실이었는지 알 수 없다.', '귓가에 아직 무전 잡음이 남아 있다.'],
  },
  faithful: {
    name: '충실한 D급',
    lines: ['당신은 목소리가 시키는 대로 했다. 끝까지.', '출구 앞에서 스피커가 말한다. "수고했다, D-9341. 이제 실험을 시작하지."', '문 너머는 바깥이 아니었다.'],
  },
};

/**
 * First match wins: discern (no lie followed, at least ceil(2/3) of the true orders followed), then by the share of
 * orders followed: <= 1/3 alone, < 2/3 half, otherwise faithful. 'none' (and missing) outcomes are not counted.
 */
export function pickEnding(outcomes, plan) {
  let counted = 0;
  let followed = 0;
  let truths = 0;
  let truthsFollowed = 0;
  let liesFollowed = 0;
  plan.forEach(({ truthful }, i) => {
    const outcome = outcomes[i] ?? 'none';
    if (outcome === 'none') return;
    counted++;
    const did = outcome === 'followed';
    if (did) followed++;
    if (truthful) {
      truths++;
      if (did) truthsFollowed++;
    } else if (did) {
      liesFollowed++;
    }
  });
  if (counted === 0) return 'alone';
  if (liesFollowed === 0 && truths > 0 && truthsFollowed >= Math.ceil((2 * truths) / 3)) return 'discern';
  if (3 * followed <= counted) return 'alone';
  if (3 * followed < 2 * counted) return 'half';
  return 'faithful';
}
