# Blender 无头脚本：生成原创低多边形机甲训练机器人 + 骨架 + 六动画，导出 GLB
# 流程（手册 §8.1/§8.2）：确定尺寸 → 建模 → 简单材质 → 绑骨 → 动画 → 导出 GLB
# 米制尺寸：站立总高约 1.8m。全部原创几何（方块机甲风），不使用任何游戏资产。
# 形象参考「训练场机器人」概念：发光面罩、肩甲、双臂持枪；持枪姿态直接做进静止姿态。
import bpy
import math

# ---------- 清理场景 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- 骨架 ----------
arm_data = bpy.data.armatures.new("Rig")
arm_obj = bpy.data.objects.new("Rig", arm_data)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')

def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b

# 骨架尺寸（米）：脚底 z=0，头顶尖约 1.8；机器人面朝 -Y（Blender 前方约定）
add_bone("Hips", (0, 0, 0.95), (0, 0, 1.05))
add_bone("Spine", (0, 0, 1.05), (0, 0, 1.45), "Hips")
add_bone("Head", (0, 0, 1.45), (0, 0, 1.80), "Spine")
add_bone("Thigh.L", (0.11, 0, 0.95), (0.11, 0, 0.50), "Hips")
add_bone("Calf.L", (0.11, 0, 0.50), (0.11, 0, 0.05), "Thigh.L")
add_bone("Thigh.R", (-0.11, 0, 0.95), (-0.11, 0, 0.50), "Hips")
add_bone("Calf.R", (-0.11, 0, 0.50), (-0.11, 0, 0.05), "Thigh.R")
# 手臂：静止姿态即「持枪指向 -Y」——大臂前抬、小臂平举
add_bone("Arm.L", (0.26, 0, 1.40), (0.24, -0.16, 1.18), "Spine")
add_bone("Forearm.L", (0.24, -0.16, 1.18), (0.07, -0.44, 1.27), "Arm.L")
add_bone("Arm.R", (-0.26, 0, 1.40), (-0.22, -0.10, 1.16), "Spine")
add_bone("Forearm.R", (-0.22, -0.10, 1.16), (-0.04, -0.30, 1.27), "Arm.R")
# 枪口挂点（右臂骨骼子级）：曳光/火光的起点
add_bone("Muzzle", (0.0, -0.72, 1.30), (0.0, -0.80, 1.30), "Forearm.R")
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 低模网格（方块组合，每块 100% 绑到对应骨） ----------
def make_mat(name, color, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    # glTF 导出读 Principled BSDF 节点，不是 viewport 的 diffuse_color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

def add_box(name, loc, scale, bone_name, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    # 绑定：骨骼形变 + 顶点组全权重
    vg = o.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    mod = o.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm_obj
    o.parent = arm_obj
    return o

ARMOR = make_mat("Armor", (0.70, 0.24, 0.28))          # 装甲红（与训练目标配色一致）
DARK = make_mat("Dark", (0.16, 0.17, 0.20))            # 深灰关节
PLATE = make_mat("Plate", (0.55, 0.57, 0.62))          # 浅灰装甲板
GUN = make_mat("Gun", (0.10, 0.10, 0.12))              # 枪身枪金属
VISOR = make_mat("Visor", (0.05, 0.08, 0.10), emission=(0.2, 0.9, 1.0), emission_strength=4.0)  # 发光面罩
CORE = make_mat("Core", (0.10, 0.05, 0.05), emission=(1.0, 0.3, 0.2), emission_strength=3.0)    # 胸口核心灯

# 头部组件（Head 骨）：头盔 + 发光面罩 + 天线
add_box("Head", (0, 0, 1.62), (0.24, 0.24, 0.26), "Head", PLATE)
add_box("Visor", (0, -0.125, 1.63), (0.18, 0.02, 0.07), "Head", VISOR)
add_box("HelmetTop", (0, 0, 1.76), (0.28, 0.28, 0.06), "Head", ARMOR)
add_box("Antenna", (0.10, 0.02, 1.84), (0.015, 0.015, 0.14), "Head", DARK)
# 躯干组件（Spine 骨）：胸甲 + 核心灯 + 背包 + 肩甲
add_box("Torso", (0, 0, 1.25), (0.42, 0.24, 0.42), "Spine", ARMOR)
add_box("ChestPlate", (0, -0.13, 1.32), (0.30, 0.06, 0.24), "Spine", PLATE)
add_box("CoreLight", (0, -0.17, 1.32), (0.08, 0.02, 0.08), "Spine", CORE)
add_box("Backpack", (0, 0.15, 1.28), (0.30, 0.08, 0.30), "Spine", DARK)
add_box("ShoulderL", (0.27, 0, 1.44), (0.16, 0.20, 0.10), "Spine", ARMOR)
add_box("ShoulderR", (-0.27, 0, 1.44), (0.16, 0.20, 0.10), "Spine", ARMOR)
# 骨盆（Hips 骨）
add_box("Pelvis", (0, 0, 0.95), (0.36, 0.22, 0.20), "Hips", DARK)
add_box("BeltPlate", (0, -0.12, 0.98), (0.28, 0.04, 0.10), "Hips", PLATE)
# 腿：大腿 + 护膝 + 小腿 + 脚
add_box("ThighL", (0.11, 0, 0.72), (0.13, 0.15, 0.45), "Thigh.L", DARK)
add_box("KneeL", (0.11, -0.08, 0.52), (0.12, 0.06, 0.10), "Thigh.L", PLATE)
add_box("CalfL", (0.11, 0, 0.28), (0.11, 0.13, 0.45), "Calf.L", ARMOR)
add_box("FootL", (0.11, -0.05, 0.04), (0.12, 0.22, 0.08), "Calf.L", DARK)
add_box("ThighR", (-0.11, 0, 0.72), (0.13, 0.15, 0.45), "Thigh.R", DARK)
add_box("KneeR", (-0.11, -0.08, 0.52), (0.12, 0.06, 0.10), "Thigh.R", PLATE)
add_box("CalfR", (-0.11, 0, 0.28), (0.11, 0.13, 0.45), "Calf.R", ARMOR)
add_box("FootR", (-0.11, -0.05, 0.04), (0.12, 0.22, 0.08), "Calf.R", DARK)
# 手臂（沿骨骼方向摆成持枪姿态）：大臂 + 护肘 + 小臂 + 手
add_box("UpperArmL", (0.25, -0.08, 1.29), (0.09, 0.20, 0.10), "Arm.L", DARK)
add_box("ElbowL", (0.24, -0.17, 1.17), (0.10, 0.06, 0.10), "Arm.L", ARMOR)
add_box("ForearmL", (0.15, -0.31, 1.235), (0.20, 0.22, 0.09), "Forearm.L", PLATE)
add_box("HandL", (0.06, -0.44, 1.27), (0.07, 0.08, 0.07), "Forearm.L", DARK)
add_box("UpperArmR", (-0.24, -0.05, 1.28), (0.09, 0.16, 0.10), "Arm.R", DARK)
add_box("ElbowR", (-0.22, -0.11, 1.15), (0.10, 0.06, 0.10), "Arm.R", ARMOR)
add_box("ForearmR", (-0.12, -0.21, 1.22), (0.18, 0.20, 0.09), "Forearm.R", PLATE)
add_box("HandR", (-0.03, -0.30, 1.27), (0.07, 0.08, 0.07), "Forearm.R", DARK)
# 步枪 v2（绑右臂，双手持握指向 -Y）：机匣 + 枪管 + 枪口制退器 + 瞄具 + 握把 + 弹匣 + 枪托
add_box("RifleBody", (0.0, -0.40, 1.29), (0.06, 0.42, 0.09), "Forearm.R", GUN)
add_box("RifleBarrel", (0.0, -0.68, 1.30), (0.035, 0.22, 0.035), "Forearm.R", GUN)
add_box("RifleMuzzle", (0.0, -0.82, 1.30), (0.05, 0.08, 0.05), "Forearm.R", DARK)
add_box("RifleScope", (0.0, -0.42, 1.36), (0.04, 0.16, 0.05), "Forearm.R", DARK)
add_box("RifleGrip", (0.0, -0.26, 1.22), (0.04, 0.05, 0.10), "Forearm.R", GUN)
add_box("RifleMag", (0.0, -0.38, 1.20), (0.045, 0.08, 0.12), "Forearm.R", GUN)
add_box("RifleStock", (0.0, -0.16, 1.28), (0.05, 0.14, 0.07), "Forearm.R", DARK)

# ---------- 动画（六个：待机 / 左移 / 右移 / 蹲下 / 受击 / 开火） ----------
FPS = 24

def new_action(name):
    act = bpy.data.actions.new(name)
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = act
    return act

def key(bone_name, frame, rot=None, loc=None):
    pb = arm_obj.pose.bones[bone_name]
    if rot is not None:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = rot
        pb.keyframe_insert("rotation_euler", frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert("location", frame=frame)

# 待机：轻微呼吸起伏
new_action("Idle")
key("Spine", 1, rot=(0, 0, 0))
key("Spine", 24, rot=(math.radians(2), 0, 0))
key("Spine", 48, rot=(0, 0, 0))
key("Hips", 1, loc=(0, 0, 0))
key("Hips", 24, loc=(0, 0, -0.01))
key("Hips", 48, loc=(0, 0, 0))

# 横移：双腿交错摆动（原地踏步感，位移由代码控制）
def strafe_action(name, phase):
    new_action(name)
    key("Thigh.L", 1, rot=(math.radians(20 * phase), 0, 0))
    key("Thigh.L", 12, rot=(math.radians(-20 * phase), 0, 0))
    key("Thigh.L", 24, rot=(math.radians(20 * phase), 0, 0))
    key("Calf.L", 1, rot=(math.radians(-15 * phase), 0, 0))
    key("Calf.L", 12, rot=(math.radians(10 * phase), 0, 0))
    key("Calf.L", 24, rot=(math.radians(-15 * phase), 0, 0))
    key("Thigh.R", 1, rot=(math.radians(-20 * phase), 0, 0))
    key("Thigh.R", 12, rot=(math.radians(20 * phase), 0, 0))
    key("Thigh.R", 24, rot=(math.radians(-20 * phase), 0, 0))
    key("Calf.R", 1, rot=(math.radians(10 * phase), 0, 0))
    key("Calf.R", 12, rot=(math.radians(-15 * phase), 0, 0))
    key("Calf.R", 24, rot=(math.radians(10 * phase), 0, 0))

strafe_action("StrafeLeft", 1)
strafe_action("StrafeRight", -1)

# 蹲下：髋部下沉、大小腿弯曲
new_action("Crouch")
key("Hips", 1, loc=(0, 0, 0))
key("Hips", 12, loc=(0, 0, -0.38))
key("Thigh.L", 12, rot=(math.radians(65), 0, 0))
key("Calf.L", 12, rot=(math.radians(-80), 0, 0))
key("Thigh.R", 12, rot=(math.radians(65), 0, 0))
key("Calf.R", 12, rot=(math.radians(-80), 0, 0))
key("Hips", 24, loc=(0, 0, -0.38))

# 受击：上身快速后仰回弹
new_action("Hit")
key("Spine", 1, rot=(0, 0, 0))
key("Spine", 3, rot=(math.radians(-18), 0, 0))
key("Spine", 10, rot=(0, 0, 0))

# 开火：右臂带动步枪快速后坐回弹（约 0.25s 单发）
new_action("Fire")
key("Forearm.R", 1, rot=(0, 0, 0))
key("Forearm.R", 2, rot=(math.radians(-10), 0, 0))
key("Forearm.R", 6, rot=(0, 0, 0))

# ---------- 全部动作推入 NLA，导出时成为独立动画剪辑 ----------
arm_obj.animation_data.action = None
for act in bpy.data.actions:
    tr = arm_obj.animation_data.nla_tracks.new()
    tr.name = act.name
    tr.strips.new(act.name, 1, act)
    tr.mute = True

# ---------- 导出 GLB ----------
bpy.ops.object.select_all(action='SELECT')
out = r"D:\1\kimi1\warmup-lab\public\assets\models\agent.glb"
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_yup=True,      # glTF 约定 Y 向上；导出后检查朝向/脚底/缩放（手册 §8.2）
    export_apply=True,
)
print("EXPORTED", out)
