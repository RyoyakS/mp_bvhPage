import * as THREE from "three/build/three.module.js";

class EDWSolver {
  constructor({ ref, cmp }) {
    const refFramesNum = ref.animations[0].tracks[0].times.length;
    const cmpFramesNum = cmp.animations[0].tracks[0].times.length;

    const minFramesNum = (this.minFramesNum = Math.min(
      refFramesNum,
      cmpFramesNum,
    ));
    const refPosMap = ref.getPosMap(minFramesNum);
    const cmpPosMap = cmp.getPosMap(minFramesNum);

    const diffPosMap = getPosDiffMap(cmpPosMap, refPosMap, minFramesNum);
    const maxDiff = getArrayMax(diffPosMap);
    const { refColorMap, cmpColorMap } = this.getColorMap(
      refFramesNum,
      cmpFramesNum,
      diffPosMap,
      maxDiff,
    );

    this.maxFramesNum = Math.max(refFramesNum, cmpFramesNum);

    ref.createAction(refColorMap, "edw animation");
    cmp.createAction(cmpColorMap, "edw animation");
    ref.jointHelper.createAction(refColorMap, "edw jointsAnimation");
    cmp.jointHelper.createAction(cmpColorMap, "edw jointsAnimation");
  }

  update() {}

  getColorMap(refFramesNum, cmpFramesNum, diffPosMap, maxDiff) {
    const minFramesNum = this.minFramesNum;
    const bonesNum = diffPosMap.length;
    const refColorMap = [];
    const cmpColorMap = [];
    const threeColor = new THREE.Color(0x7192a5);

    // Goes accross all the different joint/bones in the skeleton
    for (const i of Array(bonesNum).keys()) {
      refColorMap[i] = [];
      cmpColorMap[i] = [];

      for (const j of Array(minFramesNum).keys()) {
        const score = Math.min(
          Math.round((diffPosMap[i][j] / maxDiff) * 511),
          511,
        );

        cmpColorMap[i][j * 3 + 0] =
          0 <= score && score <= 255 ? score / 255 : 1;
        cmpColorMap[i][j * 3 + 1] =
          0 <= score && score <= 255 ? 1 : (255 - (score - 256)) / 255;
        cmpColorMap[i][j * 3 + 2] = 0;

        refColorMap[i][j * 3 + 0] = threeColor.r;
        refColorMap[i][j * 3 + 1] = threeColor.g;
        refColorMap[i][j * 3 + 2] = threeColor.b;
      }
    }

    if (refFramesNum < cmpFramesNum) {
      for (const i of Array(bonesNum).keys()) {
        for (let j = refFramesNum; j < cmpFramesNum; j++) {
          cmpColorMap[i][j * 3 + 0] = threeColor.r;
          cmpColorMap[i][j * 3 + 1] = threeColor.g;
          cmpColorMap[i][j * 3 + 2] = threeColor.b;
        }
      }
    }

    if (cmpFramesNum < refFramesNum) {
      for (const i of Array(bonesNum).keys()) {
        for (let j = cmpFramesNum; j < refFramesNum; j++) {
          refColorMap[i][j * 3 + 0] = threeColor.r;
          refColorMap[i][j * 3 + 1] = threeColor.g;
          refColorMap[i][j * 3 + 2] = threeColor.b;
        }
      }
    }

    return { refColorMap, cmpColorMap };
  }
}

class DTWSolver {
  constructor({ ref, cmp }) {
    const refFramesNum = ref.animations[0].tracks[0].times.length;
    const cmpFramesNum = cmp.animations[0].tracks[0].times.length;

    const refPosMap = ref.getPosMap(refFramesNum);
    const cmpPosMap = cmp.getPosMap(cmpFramesNum);

    const refPosSum = this.getPosSums(refFramesNum, refPosMap);
    const cmpPosSum = this.getPosSums(cmpFramesNum, cmpPosMap);

    const dtwMap = this.getDtwMap(
      refFramesNum,
      cmpFramesNum,
      refPosSum,
      cmpPosSum,
    );

    const path = this.getDtwPath(refFramesNum, cmpFramesNum, dtwMap);

    this.posterizedPath = this.getPosterizedPath(path);
    const dtwFramesNum = (this.dtwFramesNum = this.posterizedPath.length);

    const diffPosMap = getPosDiffMap(
      cmpPosMap,
      refPosMap,
      dtwFramesNum,
      this.posterizedPath,
    );

    const { countGood, countNeutral, countBad, refColorMap, cmpColorMap } =
      this.getDifferenceAnalysis(diffPosMap);

    this.countGood = countGood;
    this.countNeutral = countNeutral;
    this.countBad = countBad;

    const posterizedRefPosSum = this.getposterizedPosSum(
      refPosMap,
      this.posterizedPath,
      0,
    );
    const posterizedCmpPosSum = this.getposterizedPosSum(
      cmpPosMap,
      this.posterizedPath,
      1,
    );

    const poseDiffArray = this.getPoseDiffArray(
      posterizedRefPosSum,
      posterizedCmpPosSum,
    );

    [this.poseColorPosArray, this.poseColorValueArray] =
      this.getPoseColorArray(poseDiffArray);

    const refPath = [];
    const cmpPath = [];

    for (const i of Array(cmpFramesNum).keys())
      refPath.push(this.posterizedPath[i][0]);
    for (const i of Array(cmpFramesNum).keys())
      cmpPath.push(this.posterizedPath[i][1]);

    ref.createAction(refColorMap, "dtw animation", refPath);
    cmp.createAction(cmpColorMap, "dtw animation", cmpPath);
    //ref.createSkinAction("dtw animation", refPath);
    //cmp.createSkinAction("dtw animation", cmpPath);
    ref.jointHelper.createAction(refColorMap, "dtw jointsAnimation", refPath);
    cmp.jointHelper.createAction(cmpColorMap, "dtw jointsAnimation", cmpPath);
  }

  getPosSums(framesNum, posMap) {
    const bonesNum = posMap.length;
    const framesSum = [];

    for (const i of Array(framesNum).keys()) {
      framesSum[i] = new THREE.Vector3();

      for (const j of Array(bonesNum).keys()) {
        framesSum[i].add(posMap[j][i]);
      }
    }

    return framesSum;
  }

  getDtwMap(refFramesNum, cmpFramesNum, refPosSum, cmpPosSum) {
    const matrix = [];

    for (const i of Array(refFramesNum).keys()) {
      matrix[i] = [];

      for (const j of Array(cmpFramesNum).keys()) {
        let cost = Infinity;

        if (i > 0) {
          cost = Math.min(cost, matrix[i - 1][j]);
          if (j > 0)
            cost = Math.min(
              cost,
              Math.min(matrix[i - 1][j - 1], matrix[i][j - 1]),
            );
        } else {
          if (j > 0) cost = Math.min(cost, matrix[i][j - 1]);
          else cost = 0;
        }

        matrix[i][j] = cost + cmpPosSum[j].distanceTo(refPosSum[i]);
      }
    }

    return matrix;
  }

  getDtwPath(refFramesNum, cmpFramesNum, matrix) {
    let i = refFramesNum - 1;
    let j = cmpFramesNum - 1;

    let path = [[i, j]];

    while (i > 0 || j > 0) {
      if (i > 0) {
        if (j > 0) {
          if (matrix[i - 1][j] < matrix[i - 1][j - 1]) {
            if (matrix[i - 1][j] < matrix[i][j - 1]) {
              path.push([i - 1, j]);
              i--;
            } else {
              path.push([i, j - 1]);
              j--;
            }
          } else {
            if (matrix[i - 1][j - 1] < matrix[i][j - 1]) {
              path.push([i - 1, j - 1]);
              i--;
              j--;
            } else {
              path.push([i, j - 1]);
              j--;
            }
          }
        } else {
          path.push([i - 1, j]);
          i--;
        }
      } else {
        path.push([i, j - 1]);
        j--;
      }
    }

    return path.reverse();
  }

  getDifferenceAnalysis(diffPosMap) {
    const framesNum = this.dtwFramesNum;
    const bonesNum = diffPosMap.length;

    const base = getArrayMax(diffPosMap) - getArrayMin(diffPosMap);
    const refColorMap = [];
    const cmpColorMap = [];
    const goodColor = new THREE.Color(0x27d286);
    const neutralColor = new THREE.Color(0x262626);
    const badColor = new THREE.Color(0xd9342a);

    let countGood = 0;
    let countNeutral = 0;
    let countBad = 0;

    for (const i of Array(bonesNum).keys()) {
      refColorMap[i] = [];
      cmpColorMap[i] = [];

      const thresholdGood = 0.1;
      const thresholdBad = 0.45;

      for (const j of Array(framesNum).keys()) {
        const diff = diffPosMap[i][j] / base;

        if (diff > thresholdBad) {
          countBad++;
        } else if (diff < thresholdGood) {
          countGood++;
        } else {
          countNeutral++;
        }

        const color =
          diff > thresholdBad
            ? badColor
            : diff < thresholdGood
            ? goodColor
            : neutralColor;

        cmpColorMap[i][j * 3 + 0] = color.r;
        cmpColorMap[i][j * 3 + 1] = color.g;
        cmpColorMap[i][j * 3 + 2] = color.b;

        refColorMap[i][j * 3 + 0] = goodColor.r;
        refColorMap[i][j * 3 + 1] = goodColor.g;
        refColorMap[i][j * 3 + 2] = goodColor.b;
      }
    }

    return { countGood, countNeutral, countBad, refColorMap, cmpColorMap };
  }

  getPosterizedPath(path) {
    const posterizedPath = [];

    path.forEach((element) => {
      if (
        !posterizedPath.some((newElement) => {
          return newElement[1] === element[1];
        })
      ) {
        posterizedPath.push(element);
      }
    });

    return posterizedPath;
  }

  getposterizedPosSum(posMap, path, index) {
    const bonesNum = posMap.length;
    const framesNum = path.length;
    const framesSum = [];

    for (const i of Array(framesNum).keys()) {
      framesSum[i] = new THREE.Vector3();

      for (const j of Array(bonesNum).keys()) {
        framesSum[i].add(posMap[j][path[i][index]]);
      }
    }

    return framesSum;
  }

  getPoseDiffArray(refPosSum, cmpPosSum) {
    const framesNum = cmpPosSum.length;
    const poseDiffArray = [];

    for (const i of Array(framesNum).keys())
      poseDiffArray[i] = cmpPosSum[i].distanceTo(refPosSum[i]);

    return poseDiffArray;
  }

  getPoseColorArray(poseDiffArray) {
    const num = poseDiffArray.length;
    const poseColorArrayPos = [];
    const poseColorArrayValue = [];

    const max = Math.max(...poseDiffArray);
    const min = Math.min(...poseDiffArray);
    const base = max - min;

    const thresholdGood = 0.1;
    const thresholdBad = 0.45;

    const startValue = (poseDiffArray[0] - min) / base;
    let previousCategory =
      startValue >= thresholdBad
        ? "#FF0000"
        : startValue <= thresholdGood
        ? "#00FF00"
        : null;

    for (const i of Array(num).keys()) {
      const currentValue = (poseDiffArray[i] - min) / base;
      const currentCategory =
        currentValue >= thresholdBad
          ? "#FF0000"
          : currentValue <= thresholdGood
          ? "#00FF00"
          : null;

      if (currentCategory !== previousCategory || i === 0 || i + 1 === num) {
        poseColorArrayPos.push(i);
        poseColorArrayValue.push({ backgroundColor: currentCategory });
      }
      previousCategory = currentCategory;
    }

    return [poseColorArrayPos, poseColorArrayValue];
  }
}

function getPosDiffMap(cmpPosMap, refPosMap, framesNum, path) {
  const bonesNum = refPosMap.length;
  const diffPosMap = [];

  for (const i of Array(bonesNum).keys()) {
    diffPosMap[i] = [];

    for (const j of Array(framesNum).keys()) {
      diffPosMap[i][j] = path
        ? cmpPosMap[i][path[j][1]].distanceTo(refPosMap[i][path[j][0]])
        : cmpPosMap[i][j].distanceTo(refPosMap[i][j]);
    }
  }

  return diffPosMap;
}

function getArrayMax(arrays) {
  return Math.max(...arrays.map((subArr) => Math.max(...subArr)));
}

function getArrayMin(arrays) {
  return Math.min(...arrays.map((subArr) => Math.min(...subArr)));
}

export { EDWSolver, DTWSolver };
