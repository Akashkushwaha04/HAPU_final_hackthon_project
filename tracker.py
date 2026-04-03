import cv2
import mediapipe as mp
import asyncio
import websockets
import json
import math
import time
import base64

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# Base safe pressures
pressures = {"head": 20, "elbow": 20, "buttocks": 20, "heel": 20}

async def gesture_tracker(websocket):
    cap = cv2.VideoCapture(0)
    last_reset_time = 0

    with mp_hands.Hands(min_detection_confidence=0.7, min_tracking_confidence=0.7) as hands:
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                break

            image = cv2.flip(image, 1)
            h, w, _ = image.shape
            results = hands.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

            active_zone = None
            pinch_detected = False

            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(image, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                    
                    thumb_tip = hand_landmarks.landmark[mp_hands.HandLandmark.THUMB_TIP]
                    index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
                    
                    dist = math.hypot(thumb_tip.x - index_tip.x, thumb_tip.y - index_tip.y)
                    
                    if dist < 0.05: 
                        pinch_detected = True
                        if index_tip.y < 0.25: active_zone = "head"
                        elif index_tip.y < 0.50: active_zone = "elbow"
                        elif index_tip.y < 0.75: active_zone = "buttocks"
                        else: active_zone = "heel"
                    break 

            # Update pressure logic based on hand position
            for zone in pressures:
                if zone == active_zone:
                    pressures[zone] = min(100, pressures[zone] + 3)
                else:
                    pressures[zone] = max(20, pressures[zone] - 0.5)

            current_time = time.time()
            
            # --- NEW: DRAW DYNAMIC PRESSURE HEATMAP ---
            overlay = image.copy()
            zones_list = list(pressures.keys())
            for i, zone_key in enumerate(zones_list):
                press = pressures[zone_key]
                y1, y2 = int(h * (i / 4.0)), int(h * ((i + 1) / 4.0))
                
                # Color logic: Cyan (Safe), Orange (Warn), Red (Danger)
                if press < 60:
                    color, alpha = (255, 229, 0), 0.05   # BGR for #00E5FF
                elif press < 85:
                    color, alpha = (0, 170, 255), 0.25   # BGR for Orange
                else:
                    color, alpha = (60, 0, 255), 0.45    # BGR for Red
                    
                cv2.rectangle(overlay, (0, y1), (w, y2), color, -1)
                
            cv2.addWeighted(overlay, 1.0, image, 1.0, 0, image)

            # Draw visual guides
            cv2.line(image, (0, int(h*0.25)), (w, int(h*0.25)), (255,255,255), 1)
            cv2.line(image, (0, int(h*0.50)), (w, int(h*0.50)), (255,255,255), 1)
            cv2.line(image, (0, int(h*0.75)), (w, int(h*0.75)), (255,255,255), 1)
            
            status_text = "PINCH fingers to reset."
            color = (0, 165, 255)
            if current_time - last_reset_time < 1.0:
                status_text = f"RESET CONFIRMED: {active_zone.upper()}"
                color = (0, 255, 0)
            elif pinch_detected:
                status_text = f"Pinching in: {active_zone.upper()}"
                color = (255, 255, 0)

            cv2.putText(image, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.imshow('Remote Gesture Control (Press ESC to close)', image)

            # Encode video frame
            small_frame = cv2.resize(image, (320, 240))
            _, buffer = cv2.imencode('.jpg', small_frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
            frame_b64 = base64.b64encode(buffer).decode('utf-8')

            payload = {"frame": frame_b64, "pressures": pressures}
            
            if pinch_detected and active_zone and (current_time - last_reset_time > 2.0):
                payload["reset"] = active_zone
                pressures[active_zone] = 20 # Instantly reset pressure on python side too
                last_reset_time = current_time

            try:
                await websocket.send(json.dumps(payload))
            except websockets.exceptions.ConnectionClosed:
                break

            if cv2.waitKey(5) & 0xFF == 27:
                break
            
            await asyncio.sleep(0.03)

    cap.release()
    cv2.destroyAllWindows()

async def main():
    print("Starting WebSocket Server on ws://localhost:8765")
    async with websockets.serve(gesture_tracker, "localhost", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())