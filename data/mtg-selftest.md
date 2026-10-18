## Picture index: mtg

68143 artworks, 5.0 MB. Chosen colour weight 3, max distance 54.6.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 75.6% | 88.8% | 95.0% | 96.8% | 97.5% | 97.8% | 46.3 / 62.5 | 10.2 |
| 48 | 800 | 86.6% | 94.9% | 97.0% | 97.6% | 98.0% | 98.1% | 40.5 / 55.9 | 16.0 |
| 72 | 800 | 89.9% | 96.0% | 98.0% | 98.4% | 98.6% | 98.6% | 38.0 / 52.0 | 18.4 |
| 120 | 800 | 96.5% | 98.5% | 99.0% | 98.9% | 98.8% | 98.9% | 32.7 / 49.6 | 22.2 |

Non-card crops, best distance (chosen w): p05 59.9, p50 75.7, p90 94.4

### Learned embedding

Top-1 by card height: 32px 94.3%, 48px 98.6%, 72px 99.1%, 120px 99.3%.
Correct matches' similarity p05 0.756, p50 0.867; lead p10 0.126. Non-cards' best similarity p50 0.558, p99 0.824.
Accepted (similarity ≥ 0.824, lead ≥ 0.02) and correct: 32px 6.5%, 48px 57.6%, 72px 93.1%, 120px 98.9%

Share of cards identified correctly *and* under the cut-off: 32px 79.3%, 48px 92.0%, 72px 94.9%, 120px 96.9%
