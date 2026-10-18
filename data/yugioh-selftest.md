## Picture index: yugioh

14790 artworks, 1.1 MB. Chosen colour weight 1.5, max distance 38.4.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 98.1% | 99.4% | 99.9% | 100.0% | 99.9% | 99.9% | 24.3 / 33.5 | 13.5 |
| 48 | 800 | 91.6% | 97.6% | 99.3% | 99.4% | 99.3% | 99.1% | 30.0 / 38.5 | 8.8 |
| 72 | 800 | 91.6% | 97.6% | 99.5% | 99.6% | 99.6% | 99.6% | 29.7 / 38.2 | 9.0 |
| 120 | 800 | 97.8% | 99.6% | 99.8% | 99.8% | 99.8% | 99.6% | 24.4 / 32.8 | 13.5 |

Non-card crops, best distance (chosen w): p05 49.9, p50 60.0, p90 68.2

### Learned embedding

Top-1 by card height: 32px 91.9%, 48px 99.4%, 72px 99.9%, 120px 100.0%.
Correct matches' similarity p05 0.749, p50 0.863; lead p10 0.111. Non-cards' best similarity p50 0.42, p99 0.558.
Accepted (similarity ≥ 0.558, lead ≥ 0.02) and correct: 32px 91.3%, 48px 99.4%, 72px 99.9%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 99.9%, 48px 94.0%, 72px 95.1%, 120px 98.8%
