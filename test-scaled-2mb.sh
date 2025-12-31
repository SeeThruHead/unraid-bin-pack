#!/bin/bash
# Simple test script - fills disks with 2MB files only
# Creates random Movies/TV/Anime structure with consistent 2MB file sizes

set -euo pipefail

LOG_DIR="/tmp/unraid-bin-pack-test"
mkdir -p "$LOG_DIR"
PLAN_LOG="$LOG_DIR/plan-2mb.log"

echo "========================================" | tee "$PLAN_LOG"
echo "Unraid Bin Pack Test - 2MB Files Only" | tee -a "$PLAN_LOG"
echo "Started: $(date)" | tee -a "$PLAN_LOG"
echo "========================================" | tee -a "$PLAN_LOG"

# Clean up ALL disks first
echo "" | tee -a "$PLAN_LOG"
echo "Cleaning up all disks..." | tee -a "$PLAN_LOG"
for disk in disk{1..8}; do
    sudo rm -rf "/mnt/$disk/Movies" "/mnt/$disk/TV" "/mnt/$disk/Anime" 2>/dev/null || true
done
echo "All disks cleaned!" | tee -a "$PLAN_LOG"

# All files are exactly 2MB
FILE_SIZE_MB=2

# Simple function to create a 2MB file
create_file() {
    local disk="$1"
    local category="$2"
    local name="$3"
    local year="$4"

    case "$category" in
        "movie")
            local dir="/mnt/${disk}/Movies/${name} (${year})"
            sudo mkdir -p "$dir"
            sudo dd if=/dev/zero of="$dir/${name} - 1080p.mkv" bs=1M count="$FILE_SIZE_MB" 2>/dev/null
            ;;
        "tv")
            local season="$5"
            local episode="$6"
            local dir="/mnt/${disk}/TV/${name} (${year})/Season ${season}"
            sudo mkdir -p "$dir"
            local s=$(printf "%02d" "$season")
            local e=$(printf "%02d" "$episode")
            sudo dd if=/dev/zero of="$dir/${name} - S${s}E${e}.mkv" bs=1M count="$FILE_SIZE_MB" 2>/dev/null
            ;;
        "anime")
            local season="$5"
            local episode="$6"
            local dir="/mnt/${disk}/Anime/${name} (${year})/Season ${season}"
            sudo mkdir -p "$dir"
            local s=$(printf "%02d" "$season")
            local e=$(printf "%02d" "$episode")
            sudo dd if=/dev/zero of="$dir/${name} - S${s}E${e}.mkv" bs=1M count="$FILE_SIZE_MB" 2>/dev/null
            ;;
    esac
}

# Get current free space in MB
get_free_mb() {
    local disk="$1"
    local free_space
    free_space=$(df -BM "/mnt/$disk" | awk 'NR==2 {print $4}' | sed 's/M//')

    if [ -z "$free_space" ] || ! [[ "$free_space" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Failed to get free space for $disk" >&2
        return 1
    fi

    echo "$free_space"
}

# Fill disk to target free space with 2MB files
fill_disk() {
    local disk="$1"
    local target_free_mb="$2"
    local disk_num="${disk#disk}"
    local safety_margin=10

    echo "" | tee -a "$PLAN_LOG"
    echo "Filling $disk to ${target_free_mb}MB free (2MB files)..." | tee -a "$PLAN_LOG"

    local movie_idx=1
    local tv_idx=1
    local anime_idx=1
    local current_free=$(get_free_mb "$disk")
    local effective_target=$((target_free_mb + safety_margin))
    local max_iterations=5000
    local iteration=0

    while [ $current_free -gt $effective_target ] && [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))

        local space_to_fill=$((current_free - effective_target))

        if [ $space_to_fill -lt $FILE_SIZE_MB ]; then
            break
        fi

        # Randomly choose between movies (40%), TV (30%), anime (30%)
        local rand=$((RANDOM % 100))

        if [ $rand -lt 40 ]; then
            # Create a movie
            local year=$((2000 + RANDOM % 24))
            create_file "$disk" "movie" "Movie${disk_num}-${movie_idx}" "$year"
            movie_idx=$((movie_idx + 1))
        elif [ $rand -lt 70 ]; then
            # Create a TV episode
            local year=$((2005 + RANDOM % 20))
            local episode=$((1 + RANDOM % 12))
            create_file "$disk" "tv" "TVShow${disk_num}-${tv_idx}" "$year" 1 "$episode"

            # Increment TV index every 12 episodes (one "season")
            if [ $((episode % 12)) -eq 0 ]; then
                tv_idx=$((tv_idx + 1))
            fi
        else
            # Create an anime episode
            local year=$((2010 + RANDOM % 15))
            local episode=$((1 + RANDOM % 24))
            create_file "$disk" "anime" "Anime${disk_num}-${anime_idx}" "$year" 1 "$episode"

            # Increment anime index every 24 episodes (one "season")
            if [ $((episode % 24)) -eq 0 ]; then
                anime_idx=$((anime_idx + 1))
            fi
        fi

        # Update free space every 10 iterations
        if [ $((iteration % 10)) -eq 0 ]; then
            current_free=$(get_free_mb "$disk")
            echo "  $disk: ${current_free}MB free (target: ${target_free_mb}MB)" | tee -a "$PLAN_LOG"
        fi
    done

    current_free=$(get_free_mb "$disk")
    local files_created=$((iteration))
    echo "  $disk: COMPLETE at ${current_free}MB free with ~${files_created} files" | tee -a "$PLAN_LOG"
}

# Fill destination disks (disk1-7) with varied free space for bin-packing testing
echo "" | tee -a "$PLAN_LOG"
echo "Creating destination disks with varied free space..." | tee -a "$PLAN_LOG"

# Create disks with very different amounts of free space to test bin-packing
fill_disk "disk1" $((180 + RANDOM % 40))   # 180-220MB free
fill_disk "disk2" $((140 + RANDOM % 40))   # 140-180MB free
fill_disk "disk3" $((100 + RANDOM % 30))   # 100-130MB free
fill_disk "disk4" $((60 + RANDOM % 30))    # 60-90MB free
fill_disk "disk5" $((30 + RANDOM % 20))    # 30-50MB free
fill_disk "disk6" $((15 + RANDOM % 10))    # 15-25MB free
fill_disk "disk7" $((5 + RANDOM % 5))      # 5-10MB free

# Fill source disk (disk8) with 2MB files
# Leave MORE free space than any destination
echo "" | tee -a "$PLAN_LOG"
echo "Creating source disk with 2MB files (250-280MB free - MOST free)..." | tee -a "$PLAN_LOG"
target_free=$((250 + RANDOM % 30))  # 250-280MB free
fill_disk "disk8" "$target_free"

# Show final disk usage
echo "" | tee -a "$PLAN_LOG"
echo "========================================" | tee -a "$PLAN_LOG"
echo "Final disk usage:" | tee -a "$PLAN_LOG"
for disk in disk{1..8}; do
    df -h "/mnt/$disk" | grep -v Filesystem | tee -a "$PLAN_LOG"
done

echo "" | tee -a "$PLAN_LOG"
echo "Complete! Test data ready." | tee -a "$PLAN_LOG"
echo "All files are exactly ${FILE_SIZE_MB}MB" | tee -a "$PLAN_LOG"
echo "Logs: $LOG_DIR" | tee -a "$PLAN_LOG"
