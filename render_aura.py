import cv2
import numpy as np
import os

def create_aura_video(width, height, filename, duration=10, fps=30):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(filename, fourcc, fps, (width, height))

    total_frames = duration * fps

    # Colors (BGR)
    colors = {
        'pink': (122, 0, 230),
        'orange': (0, 85, 255),
        'yellow': (0, 230, 255),
        'cyan': (212, 245, 0),
        'blue': (255, 85, 0)
    }

    # Blotch configs
    blotches = [
            {'id': 'diffuse-pink',   'color': colors['pink'],   'size': 0.8, 'opacity': 0.5, 'blur': 100, 'speedX': 1, 'speedY': 1, 'phase': 0},
            {'id': 'diffuse-orange', 'color': colors['orange'], 'size': 0.7, 'opacity': 0.4, 'blur': 90,  'speedX': -1, 'speedY': 1.2, 'phase': 1.5},
            {'id': 'edged-pink',     'color': colors['pink'],   'size': 0.4, 'opacity': 0.7, 'blur': 40,  'speedX': -1.5, 'speedY': 0.8, 'phase': 3.1},
            {'id': 'edged-cyan',     'color': colors['cyan'],   'size': 0.45,'opacity': 0.6, 'blur': 45,  'speedX': 1.2, 'speedY': -1.3, 'phase': 4.8},
            {'id': 'edged-blue',     'color': colors['blue'],   'size': 0.35,'opacity': 0.6, 'blur': 50,  'speedX': -1, 'speedY': -1.4, 'phase': 0.8},
            {'id': 'edged-yellow',   'color': colors['yellow'], 'size': 0.3, 'opacity': 0.7, 'blur': 30,  'speedX': 1.8, 'speedY': -1.6, 'phase': 2.2}
    ]

    # Pre-generate noise for liquid effect
    noise_scale = 0.02
    noise_strength = 20

    # Create static noise maps for displacement
    xx, yy = np.meshgrid(np.arange(width), np.arange(height))

    for f in range(total_frames):
        t = (f / total_frames) * 2 * np.pi

        # Base frame (dark background)
        frame = np.zeros((height, width, 3), dtype=np.float32)

        for b in blotches:
            # Calculate position
            cx = width // 2 + np.sin(t * b['speedX'] + b['phase']) * (width * 0.15)
            cy = height // 2 + np.cos(t * b['speedY'] + b['phase']) * (height * 0.1)

            # Draw blotch
            radius = int(min(width, height) * b['size'] / 2)
            mask = np.zeros((height, width), dtype=np.float32)

            # Simple ellipse with some "morphing" (changing axis)
            ax1 = int(radius * (1 + 0.1 * np.sin(t * 2 + b['phase'])))
            ax2 = int(radius * (1 + 0.1 * np.cos(t * 2 + b['phase'])))

            cv2.ellipse(mask, (int(cx), int(cy)), (ax1, ax2), 0, 0, 360, 1, -1)

            # Blur
            blur_size = max(3, int(b['blur'] * (min(width, height) / 400)))
            if blur_size % 2 == 0: blur_size += 1
            mask = cv2.GaussianBlur(mask, (blur_size, blur_size), 0)

            # Apply color and opacity
            blotch_color = np.array(b['color'], dtype=np.float32) / 255.0

            # Screen blend: Result = 1 - (1 - A) * (1 - B)
            frame = 1.0 - (1.0 - frame) * (1.0 - mask[:, :, np.newaxis] * blotch_color * b['opacity'])

        # Liquid displacement effect
        # Create a simple periodic displacement
        dx = noise_strength * np.sin(yy * noise_scale + t)
        dy = noise_strength * np.cos(xx * noise_scale + t)

        map_x = (xx + dx).astype(np.float32)
        map_y = (yy + dy).astype(np.float32)

        distorted = cv2.remap(frame, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

        # Increase brightness slightly to pop more behind glass
        brightened = distorted * 1.2

        # Convert back to uint8
        final_frame = (np.clip(brightened, 0, 1) * 255).astype(np.uint8)
        out.write(final_frame)

    out.release()
    print(f"Finished rendering {filename}")

if __name__ == "__main__":
    os.makedirs("assets/videos", exist_ok=True)
    sizes = [
        (400, 400, "aura_400x400.mp4"),
        (600, 400, "aura_600x400.mp4"),
        (800, 400, "aura_800x400.mp4"),
        (400, 600, "aura_400x600.mp4"),
        (1000, 500, "aura_1000x500.mp4")
    ]
    for w, h, name in sizes:
        create_aura_video(w, h, os.path.join("assets/videos", name))
