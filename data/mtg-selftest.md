## Picture index: mtg

68143 artworks, 5.0 MB. Chosen colour weight 3, max distance 53.5.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 80.3% | 91.0% | 96.5% | 97.8% | 98.6% | 98.9% | 45.5 / 61.4 | 11.5 |
| 48 | 800 | 86.8% | 95.1% | 98.4% | 98.8% | 99.1% | 99.3% | 41.3 / 54.0 | 15.6 |
| 72 | 800 | 91.5% | 97.0% | 98.8% | 99.1% | 99.3% | 99.3% | 37.9 / 52.3 | 19.3 |
| 120 | 800 | 96.9% | 99.0% | 99.4% | 99.5% | 99.5% | 99.5% | 33.6 / 46.9 | 23.6 |

Non-card crops, best distance (chosen w): p05 60.6, p50 74.0, p90 90.5

### Learned embedding

Top-1 by card height: 32px 92.9%, 48px 99.4%, 72px 99.5%, 120px 99.6%.
Correct matches' similarity p05 0.761, p50 0.868; lead p10 0.131. Non-cards' best similarity p50 0.556, p99 0.8.
Accepted (similarity ≥ 0.8, lead ≥ 0.02) and correct: 32px 12.9%, 48px 72.5%, 72px 97.8%, 120px 99.0%

Share of cards identified correctly *and* under the cut-off: 32px 81.4%, 48px 92.9%, 72px 95.5%, 120px 98.3%
