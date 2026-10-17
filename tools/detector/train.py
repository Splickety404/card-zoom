"""Trains the card detector on frames from synth.py and exports it for the browser.

Starts from Ultralytics' small oriented-box model (YOLO11n-OBB, AGPL-3.0) and writes
models/cards-obb.onnx (one class, 640 px input, outputs boxes with angles).
Usage: python train.py DATA_YAML [--epochs 20] [--imgsz 640] [--out models/cards-obb.onnx]
Needs: pip install ultralytics onnx onnxslim
"""
import argparse, shutil
from ultralytics import YOLO

ap = argparse.ArgumentParser()
ap.add_argument('data')
ap.add_argument('--epochs', type=int, default=20)
ap.add_argument('--imgsz', type=int, default=640)
ap.add_argument('--batch', type=int, default=16)
ap.add_argument('--weights', default='yolo11n-obb.pt')
ap.add_argument('--out', default='models/cards-obb.onnx')
a = ap.parse_args()

model = YOLO(a.weights)
model.train(data=a.data, epochs=a.epochs, imgsz=a.imgsz, batch=a.batch, device='cpu', workers=4,
            # Cards appear at any angle (tapped, upside down), and the frames already carry blur,
            # glare and compression, so rotate freely but keep colour jitter modest.
            degrees=180, flipud=0.5, fliplr=0.5, mosaic=1.0, scale=0.5, hsv_h=0.015, hsv_s=0.4, hsv_v=0.3,
            close_mosaic=3, patience=100, plots=False, project='runs', name='cards', exist_ok=True)
onnx = YOLO(str(model.trainer.best)).export(format='onnx', imgsz=a.imgsz, opset=17, simplify=True, dynamic=False)
shutil.copy(onnx, a.out)
print('wrote', a.out)
