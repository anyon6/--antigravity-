import os
import sys
import subprocess

# Auto-install Pillow if missing
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow not found, installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def draw_baseball(size):
    # Create white circle on transparent background
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw baseball core (white circle)
    padding = max(1, size // 16)
    box = [padding, padding, size - padding, size - padding]
    draw.ellipse(box, fill=(245, 245, 240, 255), outline=(100, 100, 100, 255), width=max(1, size // 24))
    
    # Draw baseball seams (red curves)
    # Left curve
    left_box = [-size // 2, padding, size - padding, size - padding]
    # We draw arcs for the curves
    draw.arc(left_box, 300, 60, fill=(220, 20, 60, 255), width=max(1, size // 20))
    
    # Right curve
    right_box = [padding, padding, size + size // 2, size - padding]
    draw.arc(right_box, 120, 240, fill=(220, 20, 60, 255), width=max(1, size // 20))
    
    return img

def main():
    sizes = [16, 48, 128]
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    for s in sizes:
        img = draw_baseball(s)
        filename = f"icon{s}.png"
        filepath = os.path.join(output_dir, filename)
        img.save(filepath, "PNG")
        print(f"Saved {filepath}")

if __name__ == "__main__":
    main()
