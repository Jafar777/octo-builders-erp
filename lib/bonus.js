// Monthly KPI bonus: the pool is split between the top places (1st, 2nd, 3rd…)
// among staff whose KPI score reaches the month's minimum. Pure functions over the
// rows of computeMonth().

const round2 = (n) => Math.round(n * 100) / 100;

export function monthSplit(state, settings) {
  return state.bonusSplit?.length ? state.bonusSplit : settings.hr.bonusSplit;
}

// Where `userId` stands for each paid place and how many KPI points they still need.
// Scores are whole numbers, so passing someone takes their score + 1.
export function bonusStanding(rows, userId, state, settings) {
  const split = monthSplit(state, settings);
  const ranked = rows.filter((r) => r.kpi).sort((a, b) => a.kpi.rank - b.kpi.rank);
  const me = ranked.find((r) => r.staff.id === userId);
  const minScore = state.bonusMinScore || 0;
  const myScore = me?.kpi.score ?? null;

  const places = split.map((percent, i) => {
    const place = i + 1;
    const holder = ranked[i];
    let needed = null;
    if (me) {
      needed =
        me.kpi.rank <= place
          ? Math.max(0, minScore - myScore)
          : Math.max(minScore - myScore, (holder?.kpi.score ?? 0) - myScore + 1, 0);
    }
    return {
      place,
      percent,
      amount: round2(((state.bonusPool || 0) * percent) / 100),
      scoreToBeat: holder?.kpi.score ?? null,
      holderId: holder?.staff.id || null,
      needed,
      secured: Boolean(me) && me.kpi.rank <= place && myScore >= minScore && myScore > 0,
      mine: Boolean(me) && me.kpi.rank === place,
    };
  });

  // Where the points are: the indicators with the most points still open, in score points.
  const maxTotal = (me?.kpi.indicators || []).reduce((a, i) => a + (i.max || 0), 0) || 1;
  const opportunities = (me?.kpi.indicators || [])
    .map((i) => ({ key: i.key, name: i.name, gain: Math.round((((i.max || 0) - (i.points || 0)) / maxTotal) * 1000) / 10 }))
    .filter((o) => o.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  return {
    month: state.month,
    pool: state.bonusPool || 0,
    currency: state.bonusCurrency || settings.currencies.base,
    split,
    minScore,
    note: state.bonusNote || "",
    closed: Boolean(state.closed),
    ranked: Boolean(me),
    myScore,
    myRank: me?.kpi.rank ?? null,
    of: ranked.length,
    myBonus: me?.kpi.bonus || 0,
    places,
    opportunities,
  };
}
