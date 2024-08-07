from . import math3d
from . import bvh_helper

import numpy as np


class MediapipeSkeleton(object):

    def __init__(self):
        self.root = "MidHip"
        self.keypoint2index = {
            'MidHip': 0,
            'RightHip': 1,
            'RightKnee': 2,
            'RightAnkle': 3,
            'RightHeelEndSite': 4,
            'RightFootIndexEndSite': 5,
            'LeftHip': 6,
            'LeftKnee': 7,
            'LeftAnkle': 8,
            'LeftHeelEndSite': 9,
            'LeftFootIndexEndSite': 10,
            'Spine': 11,
            'Nose': 12,
            'MidShoulder': 13,
            'LeftShoulder': 14,
            'LeftElbow': 15,
            'LeftWrist': 16,
            'LeftPinkyEndSite': 17,
            'LeftIndexEndSite': 18,
            'LeftThumbEndSite': 19,
            'RightShoulder': 20,
            'RightElbow': 21,
            'RightWrist': 22,
            'RightPinkyEndSite': 23,
            'RightIndexEndSite': 24,
            'RightThumbEndSite': 25,

            'HeadEndSite': 26
        }

        self.index2keypoint = {v: k for k, v in self.keypoint2index.items()}
        self.keypoint_num = len(self.keypoint2index)

        self.children = {
            'MidHip': ['Spine', "RightHip", "LeftHip"],
            'Spine': ['MidShoulder'],
            'MidShoulder': ['Nose', 'RightShoulder', 'LeftShoulder'],
            'Nose': ['HeadEndSite'],
            'HeadEndSite': [],

            'RightHip': ['RightKnee'],
            'RightKnee': ['RightAnkle'],
            'RightAnkle': ['RightHeelEndSite', 'RightFootIndexEndSite'],
            'RightHeelEndSite': [],
            'RightFootIndexEndSite': [],

            'LeftHip': ['LeftKnee'],
            'LeftKnee': ['LeftAnkle'],
            'LeftAnkle': ['LeftHeelEndSite', 'LeftFootIndexEndSite'],
            'LeftHeelEndSite': [],
            'LeftFootIndexEndSite': [],

            'RightShoulder': ['RightElbow'],
            'RightElbow': ['RightWrist'],
            'RightWrist': ['RightPinkyEndSite', 'RightIndexEndSite', 'RightThumbEndSite'],
            'RightPinkyEndSite': [],
            'RightIndexEndSite': [],
            'RightThumbEndSite': [],

            'LeftShoulder': ['LeftElbow'],
            'LeftElbow': ['LeftWrist'],
            'LeftWrist': ['LeftPinkyEndSite', 'LeftIndexEndSite', 'LeftThumbEndSite'],
            'LeftPinkyEndSite': [],
            'LeftIndexEndSite': [],
            'LeftThumbEndSite': [],

            'LeftElbow': ['LeftWrist'],
            'LeftWrist': ['LeftPinkyEndSite', 'LeftIndexEndSite', 'LeftThumbEndSite'],
            'LeftPinkyEndSite': [],
            'LeftIndexEndSite': [],
            'LeftThumbEndSite': [],

            'RightElbow': ['RightWrist'],
            'RightWrist': ['RightPinkyEndSite', 'RightIndexEndSite', 'RightThumbEndSite'],
            'RightPinkyEndSite': [],
            'RightIndexEndSite': [],
            'RightThumbEndSite': []

        }
        self.parent = {self.root: None}
        for parent, children in self.children.items():
            for child in children:
                self.parent[child] = parent

        self.left_joints = [
            joint for joint in self.keypoint2index
            if 'Left' in joint
        ]
        self.right_joints = [
            joint for joint in self.keypoint2index
            if 'Right' in joint
        ]

        # T-pose
        self.initial_directions = {
            'MidHip': [0, 0, 0],
            'Spine': [0, 0, 1],
            'MidShoulder': [0, 0, 1],
            'Nose': [0, 0, 1],
            'HeadEndSite': [0, 0, 1],

            'RightHip': [-1, 0, 0],
            'RightKnee': [0, 0, -1],
            'RightAnkle': [0, 0, -1],
            'RightHeelEndSite': [0, 1, -1],
            'RightFootIndexEndSite': [0, -1, -1],

            # 'LeftHip': [1, 0, 0],
            # 'LeftKnee': [0, 0, 1],
            # 'LeftAnkle': [0, 0, 1],
            # 'LeftHeelEndSite': [0, 1, -1],
            # 'LeftFootIndexEndSite': [0, -1, -1],
            'LeftHip': [1, 0, 0],
            'LeftKnee': [0, 0, -1],
            'LeftAnkle': [0, 0, -1],
            'LeftHeelEndSite': [0, 1, -1],
            'LeftFootIndexEndSite': [0, -1, -1],

            'RightShoulder': [-1, 0, 0],
            'RightElbow': [-1, 0, 0],
            'RightWrist': [-1, 0, 0],
            'RightPinkyEndSite': [-1, 1, 0],
            'RightIndexEndSite': [-1, 0, 0],
            'RightThumbEndSite': [-1, -1, 0],

            'LeftShoulder': [1, 0, 0],
            'LeftElbow': [1, 0, 0],
            'LeftWrist': [1, 0, 0],
            'LeftPinkyEndSite': [1, 1, 0],
            'LeftIndexEndSite': [1, 0, 0],
            'LeftThumbEndSite': [1, -1, 0],
        }

    def get_initial_offset(self, poses_3d):
        # TODO: RANSAC
        bone_lens = {self.root: [0]}
        stack = [self.root]
        while stack:
            parent = stack.pop()
            p_idx = self.keypoint2index[parent]
            for child in self.children[parent]:
                if 'EndSite' in child:
                    bone_lens[child] = 0.4 * bone_lens[parent]
                    continue
                stack.append(child)

                c_idx = self.keypoint2index[child]
                bone_lens[child] = np.linalg.norm(
                    poses_3d[:, p_idx] - poses_3d[:, c_idx],
                    axis=1
                )

        bone_len = {}
        for joint in self.keypoint2index:
            if 'Left' in joint or 'Right' in joint:
                base_name = joint.replace('Left', '').replace('Right', '')
                left_len = np.mean(bone_lens['Left' + base_name])
                right_len = np.mean(bone_lens['Right' + base_name])
                bone_len[joint] = (left_len + right_len) / 2
            else:
                bone_len[joint] = np.mean(bone_lens[joint])

        initial_offset = {}
        for joint, direction in self.initial_directions.items():

            direction = np.array(direction) / \
                max(np.linalg.norm(direction), 1e-12)
            initial_offset[joint] = direction * bone_len[joint]

        return initial_offset

    def get_bvh_header(self, poses_3d):
        initial_offset = self.get_initial_offset(poses_3d)
        nodes = {}
        for joint in self.keypoint2index:
            is_root = joint == self.root
            is_end_site = 'EndSite' in joint
            nodes[joint] = bvh_helper.BvhNode(
                name=joint,
                offset=initial_offset[joint],
                rotation_order='zxy' if not is_end_site else '',
                is_root=is_root,
                is_end_site=is_end_site,
            )
        for joint, children in self.children.items():
            nodes[joint].children = [nodes[child] for child in children]
            for child in children:
                nodes[child].parent = nodes[joint]

        header = bvh_helper.BvhHeader(root=nodes[self.root], nodes=nodes)
        return header

    def pose2euler(self, pose, header):
        channel = []
        quats = {}
        eulers = {}
        stack = [header.root]
        while stack:
            node = stack.pop()
            joint = node.name
            joint_idx = self.keypoint2index[joint]

            if node.is_root:
                channel.extend(pose[joint_idx])

            index = self.keypoint2index
            order = None
            if joint == 'MidHip':
                x_dir = pose[index['LeftHip']] - pose[index['RightHip']]
                y_dir = None
                z_dir = pose[index['Nose']] - pose[joint_idx]
                order = 'zyx'
            elif joint in ['RightHip', 'RightKnee']:
                child_idx = self.keypoint2index[node.children[0].name]
                x_dir = pose[index['MidHip']] - pose[index['RightHip']]
                y_dir = None
                z_dir = pose[joint_idx] - pose[child_idx]
                order = 'zyx'
            elif joint in ['LeftHip', 'LeftKnee']:
                child_idx = self.keypoint2index[node.children[0].name]
                x_dir = pose[index['LeftHip']] - pose[index['MidHip']]
                y_dir = None
                z_dir = pose[joint_idx] - pose[child_idx]
                order = 'zyx'
            elif joint == 'Spine':
                x_dir = pose[index['LeftHip']] - pose[index['RightHip']]
                y_dir = None
                z_dir = pose[index['MidShoulder']] - pose[joint_idx]
                order = 'zyx'
            elif joint == 'MidShoulder':
                x_dir = pose[index['LeftShoulder']] - \
                    pose[index['RightShoulder']]
                y_dir = None
                z_dir = pose[joint_idx] - pose[index['Spine']]
                order = 'zyx'
            elif joint == 'Neck':
                x_dir = None
                y_dir = pose[index['MidShoulder']] - pose[joint_idx]
                z_dir = pose[index['HeadEndSite']] - pose[index['MidShoulder']]
                order = 'zxy'
            elif joint == 'LeftShoulder':
                x_dir = pose[index['LeftElbow']] - pose[joint_idx]
                y_dir = pose[index['LeftElbow']] - pose[index['LeftWrist']]
                z_dir = None
                order = 'xzy'
            elif joint == 'LeftElbow':
                x_dir = pose[index['LeftWrist']] - pose[joint_idx]
                y_dir = pose[joint_idx] - pose[index['LeftShoulder']]
                z_dir = None
                order = 'xzy'
            elif joint == 'LeftWrist':
                x_dir = pose[joint_idx] - pose[index['LeftIndexEndSite']]
                y_dir = pose[joint_idx] - pose[index['LeftElbow']]
                z_dir = None
                order = 'xzy'
            elif joint == 'RightShoulder':
                x_dir = pose[joint_idx] - pose[index['RightElbow']]
                y_dir = pose[index['RightElbow']] - pose[index['RightWrist']]
                z_dir = None
                order = 'xzy'
            elif joint == 'RightElbow':
                x_dir = pose[joint_idx] - pose[index['RightWrist']]
                y_dir = pose[joint_idx] - pose[index['RightShoulder']]
                z_dir = None
                order = 'xzy'
            elif joint == 'RightWrist':
                x_dir = pose[joint_idx] - pose[index['RightIndexEndSite']]
                y_dir = pose[joint_idx] - pose[index['RightElbow']]
                z_dir = None
                order = 'xzy'
            if order:
                dcm = math3d.dcm_from_axis(x_dir, y_dir, z_dir, order)
                quats[joint] = math3d.dcm2quat(dcm)
            else:
                quats[joint] = quats[self.parent[joint]].copy()

            local_quat = quats[joint].copy()
            if node.parent:
                local_quat = math3d.quat_divide(
                    q=quats[joint], r=quats[node.parent.name]
                )

            euler = math3d.quat2euler(
                q=local_quat, order=node.rotation_order
            )
            euler = np.rad2deg(euler)
            eulers[joint] = euler
            channel.extend(euler)

            for child in node.children[::-1]:
                if not child.is_end_site:
                    stack.append(child)

        return channel

    def poses2bvh(self, poses_3d,fps, header=None, output_file=None):
        if not header:
            header = self.get_bvh_header(poses_3d)

        channels = []
        for frame, pose in enumerate(poses_3d):
            channels.append(self.pose2euler(pose, header))

        if output_file:
            bvh_helper.write_bvh(output_file, header, channels,fps)

        return channels, header
