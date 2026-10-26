## Picture index: yugioh

14817 artworks, 1.1 MB. Chosen colour weight 2, max distance 46.2.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 98.5% | 99.6% | 99.8% | 99.8% | 99.9% | 99.8% | 29.0 / 39.3 | 15.7 |
| 48 | 800 | 92.9% | 97.8% | 99.8% | 99.8% | 99.9% | 99.9% | 35.0 / 46.3 | 11.2 |
| 72 | 800 | 92.6% | 97.9% | 99.8% | 99.9% | 99.9% | 99.9% | 34.9 / 46.1 | 11.6 |
| 120 | 800 | 97.9% | 99.1% | 99.6% | 99.6% | 99.6% | 99.4% | 29.1 / 40.0 | 17.3 |

Non-card crops, best distance (chosen w): p05 56.5, p50 70.2, p90 83.4

### Learned embedding

Top-1 by card height: 32px 90.6%, 48px 99.4%, 72px 99.9%, 120px 99.9%.
Correct matches' similarity p05 0.748, p50 0.863; lead p10 0.118. Non-cards' best similarity p50 0.416, p99 0.596.
Accepted (similarity ≥ 0.596, lead ≥ 0.02) and correct: 32px 88.1%, 48px 99.4%, 72px 99.9%, 120px 99.9%

Share of cards identified correctly *and* under the cut-off: 32px 99.1%, 48px 94.5%, 72px 95.4%, 120px 97.9%
