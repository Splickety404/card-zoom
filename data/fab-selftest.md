## Picture index: fab

16657 artworks, 1.2 MB. Chosen colour weight 2, max distance 48.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 59.3% | 64.4% | 65.4% | 65.6% | 65.5% | 65.0% | 40.2 / 52.2 | 0.1 |
| 48 | 800 | 62.3% | 65.1% | 65.4% | 65.4% | 65.5% | 65.5% | 37.7 / 48.9 | 0.1 |
| 72 | 800 | 60.8% | 63.8% | 64.6% | 64.9% | 65.0% | 65.1% | 36.3 / 48.4 | 0.1 |
| 120 | 800 | 64.5% | 65.0% | 65.3% | 65.4% | 65.5% | 65.5% | 31.7 / 41.6 | 0.1 |

Non-card crops, best distance (chosen w): p05 57.8, p50 67.2, p90 77.3

### Learned embedding

Top-1 by card height: 32px 62.1%, 48px 65.9%, 72px 66.5%, 120px 67.5%.
Correct matches' similarity p05 0.697, p50 0.84; lead p10 0.002. Non-cards' best similarity p50 0.452, p99 0.59.
Accepted (similarity ≥ 0.59, lead ≥ 0.02) and correct: 32px 52.5%, 48px 65.6%, 72px 66.5%, 120px 67.5%

Share of cards identified correctly *and* under the cut-off: 32px 58.6%, 48px 61.9%, 72px 62.0%, 120px 65.3%
