## Picture index: yugioh

14790 artworks, 1.1 MB. Chosen colour weight 3, max distance 62.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 97.4% | 99.4% | 99.5% | 99.5% | 99.5% | 99.5% | 38.3 / 53.0 | 20.0 |
| 48 | 800 | 91.0% | 96.5% | 98.5% | 98.9% | 99.0% | 99.1% | 46.6 / 62.7 | 13.3 |
| 72 | 800 | 89.5% | 96.4% | 98.9% | 99.4% | 99.6% | 99.8% | 46.1 / 62.8 | 14.0 |
| 120 | 800 | 98.1% | 99.6% | 99.8% | 99.8% | 99.8% | 99.8% | 38.5 / 55.0 | 21.4 |

Non-card crops, best distance (chosen w): p05 73.9, p50 94.0, p90 109.7

### Learned embedding

Top-1 by card height: 32px 93.3%, 48px 99.8%, 72px 99.9%, 120px 100.0%.
Correct matches' similarity p05 0.748, p50 0.863; lead p10 0.116. Non-cards' best similarity p50 0.419, p99 0.558.
Accepted (similarity ≥ 0.558, lead ≥ 0.02) and correct: 32px 92.3%, 48px 99.8%, 72px 99.9%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 99.0%, 48px 94.4%, 72px 94.6%, 120px 98.8%
