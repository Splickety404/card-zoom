## Picture index: yugioh

14825 artworks, 1.1 MB. Chosen colour weight 3, max distance 60.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 97.6% | 98.8% | 99.5% | 99.5% | 99.5% | 99.6% | 37.5 / 50.5 | 19.7 |
| 48 | 800 | 90.9% | 97.1% | 98.9% | 99.3% | 99.1% | 99.1% | 45.9 / 60.6 | 14.4 |
| 72 | 800 | 92.9% | 97.5% | 98.8% | 98.9% | 99.0% | 99.1% | 45.1 / 60.8 | 16.2 |
| 120 | 800 | 97.6% | 99.1% | 99.4% | 99.1% | 99.3% | 99.3% | 38.5 / 53.0 | 21.1 |

Non-card crops, best distance (chosen w): p05 72.8, p50 91.7, p90 111.2

### Learned embedding

Top-1 by card height: 32px 92.8%, 48px 99.4%, 72px 99.8%, 120px 99.8%.
Correct matches' similarity p05 0.755, p50 0.864; lead p10 0.116. Non-cards' best similarity p50 0.418, p99 0.537.
Accepted (similarity ≥ 0.537, lead ≥ 0.02) and correct: 32px 92.8%, 48px 99.4%, 72px 99.8%, 120px 99.8%

Share of cards identified correctly *and* under the cut-off: 32px 99.1%, 48px 94.3%, 72px 94.1%, 120px 97.8%
