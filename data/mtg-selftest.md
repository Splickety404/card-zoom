## Picture index: mtg

68375 artworks, 5.1 MB. Chosen colour weight 2, max distance 41.4.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 77.6% | 89.0% | 95.3% | 96.8% | 97.1% | 97.3% | 35.4 / 46.9 | 8.5 |
| 48 | 800 | 87.3% | 93.9% | 97.5% | 98.3% | 98.3% | 97.9% | 31.8 / 42.1 | 11.8 |
| 72 | 800 | 91.5% | 96.6% | 98.3% | 98.5% | 98.6% | 98.5% | 29.6 / 40.4 | 13.6 |
| 120 | 800 | 96.4% | 98.5% | 98.9% | 99.1% | 99.1% | 99.0% | 26.0 / 37.1 | 17.2 |

Non-card crops, best distance (chosen w): p05 48.8, p50 58.0, p90 69.4

### Learned embedding

Top-1 by card height: 32px 93.1%, 48px 99.1%, 72px 99.4%, 120px 99.5%.
Correct matches' similarity p05 0.749, p50 0.865; lead p10 0.128. Non-cards' best similarity p50 0.559, p99 0.832.
Accepted (similarity ≥ 0.832, lead ≥ 0.02) and correct: 32px 3.4%, 48px 49.5%, 72px 91.6%, 120px 98.5%

Share of cards identified correctly *and* under the cut-off: 32px 80.6%, 48px 92.1%, 72px 95.0%, 120px 97.3%
