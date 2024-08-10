"use strict";

import sharp from "sharp";
import { Delaunay } from "d3-delaunay";

const neighborLocations = [
    [-1, -1],
    [ 0, -1],
    [ 1, -1],
    [ 1,  0],
    [ 1,  1],
    [ 0,  1],
    [-1,  1],
    [-1,  0]
];

let argsArray = process.argv.slice(2);

let dbgMode = false;

for (let i = argsArray.length + 1; i >= 0; i--) {
    let arg = argsArray[i];
    if (arg == "-d") {
        dbgMode = true;
        argsArray.splice(i, 1);
    }
}

if (process.argv.length < 3) {
    console.log("pixelfix \"path to file\" to fix transparent pixels in file");
    console.log("pixelfix \"path to file\" \"path to file 2\" to fix transparent pixels in multiple files");
    console.log("pixelfix -d \"path to file\" to view debug output (will overwrite file)");
    process.exit();
}

let promises = [];
for (let fileLocation of argsArray) {
    promises.push((async function() {
        let imageBuffer = await sharp(fileLocation).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
        let { data, info } = imageBuffer;

        let width = info.width;
        let height = info.height;

        let voronoiPoints = [];
        let voronoiColors = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let idx = (y * width + x) * 4;
                let alpha = data[idx + 3];
                if (alpha != 0) {
                    let red = data[idx + 0];
                    let green = data[idx + 1];
                    let blue = data[idx + 2];
                    for (let offset of neighborLocations) {
                        let neighborX = x + offset[0];
                        let neighborY = y + offset[1];
                        if (neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height) {
                            let neighborIdx = (neighborY * width + neighborX) * 4;
                            let neighborAlpha = data[neighborIdx + 3];
                            if (neighborAlpha == 0) {
                                voronoiPoints.push([x, y]);
                                voronoiColors.push([red, green, blue]);
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (voronoiPoints.length > 0) {
            let dela = Delaunay.from(voronoiPoints);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let idx = (y * width + x) * 4;
                    let alpha = data[idx + 3];
                    if (alpha == 0) {
                        let closestIndex = dela.find(x, y);
                        if (closestIndex != -1) {
                            let color = voronoiColors[closestIndex];

                            data[idx + 0] = color[0];
                            data[idx + 1] = color[1];
                            data[idx + 2] = color[2];
                            if (dbgMode) {
                                data[idx + 3] = 255;
                            }
                        }
                    }
                }
            }

            await sharp(data, { raw: { width: width, height: height, channels: 4 } })
                .toFile(fileLocation);

            console.log(`Written to ${fileLocation}`);
        } else {
            console.log(`No transparent pixels to fix in ${fileLocation}`);
        }
    })());
}

Promise.all(promises).then(() => {
    console.log("Press any key to exit");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", process.exit.bind(process, 0));
});
