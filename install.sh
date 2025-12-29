#!/bin/bash
#
# Unraid Bin-Pack Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/SeeThruHead/unraid-bin-pack/main/install.sh | bash
#

set -e

echo "Unraid Bin-Pack Docker Wrapper Setup"
echo "====================================="
echo ""

# Use sensible defaults
MOUNT_POINT=/mnt
CONFIG_DIR=/mnt/user/appdata/unraid-bin-pack
IMAGE_TAG=latest
OUTPUT_PATH=./unraid-bin-pack

echo "Creating wrapper script with defaults..."
echo "  Mount point: $MOUNT_POINT"
echo "  Config dir:  $CONFIG_DIR"
echo "  Image tag:   $IMAGE_TAG"
echo ""

# Generate wrapper script
cat > "$OUTPUT_PATH" << EOF
#!/bin/bash
#
# Unraid Bin-Pack Docker Wrapper
# Generated on $(date -Iseconds)
#
# Mount points:
#   - $MOUNT_POINT (Unraid disks)
#   - $CONFIG_DIR (config/plan files)
#
# Docker image: seethruhead/unraid-bin-pack:$IMAGE_TAG
#

docker run --rm -it \\
  -v "$MOUNT_POINT:$MOUNT_POINT" \\
  -v "$CONFIG_DIR:/config" \\
  seethruhead/unraid-bin-pack:$IMAGE_TAG "\$@"
EOF

# Make executable
chmod +x "$OUTPUT_PATH"

echo "✓ Wrapper script created: $OUTPUT_PATH"
echo ""
echo "Default configuration:"
echo "  Disks:  $MOUNT_POINT"
echo "  Config: $CONFIG_DIR"
echo "  Image:  seethruhead/unraid-bin-pack:$IMAGE_TAG"
echo ""
echo "Edit $OUTPUT_PATH to customize mount points if needed."
echo ""
echo "Usage:"
echo "  $OUTPUT_PATH plan --help"
echo "  $OUTPUT_PATH plan --path-filter \"/Movies,/TV\""
echo "  $OUTPUT_PATH apply"
echo ""
