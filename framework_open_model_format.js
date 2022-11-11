/*
	Framework Open Model Plugin - A Blockbench plugin to create models for Framework Open Model format
	Copyright (C) 2022  MrCrayfish

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
var rotateOnAxisOrig;

(function() {
	var codec;
	var exportAction;

	Plugin.register('framework_open_model_format', {
		title: 'Open Model Format',
		author: 'MrCrayfish',
		description: 'Create JSON Block Models using Framework\'s Open Model format',
		icon: 'fa-layer-group',
		version: '0.1.0',
		variant: 'both',
		tags: ['Minecraft Java Edition'],
		min_version: '4.5.0',
		onload() {
			window.Language.addTranslations('en', {
				'format.framework_open_model': 'Framework Open Model',
				'format.framework_open_model.desc': 'Block or item model using Framework\'s Open Model format',
				'format.framework_open_model.info.rotation': 'Unlike the Java Block/Item format, rotations are not restricted to a **22.5** degree steps however it is still only one axis per element.',
				'format.framework_open_model.info.size': 'The size of elements are no longer retricted to the bounds (**-16** to **32**) and can even be positioned outside of the bounds to create larger models!',
				'format.framework_open_model.info.loader': 'The exported model can only be loaded when [**Framework**](https://www.curseforge.com/minecraft/mc-mods/framework) is installed to your game. This format can not be used for the vanilla game.',
				'settings.category.open_model': 'Open Model'
			});

			codec = FrameworkOpenModelCodec();

			exportAction = new Action({
				id: 'export_framework_open_model',
				name: 'Export Open Model',
				icon: 'fa-layer-group',
				description: 'Exports the model to Framework Open Model format',
				category: 'file',
				condition: (_) => Format.id === 'framework_open_model',
				click: () => {
					codec.export();
				}
			});
			MenuBar.addAction(exportAction, 'file.export');
		},
		onunload() {
			codec.delete();
			exportAction.delete();
		}
	});
})();

/*
 * A codec for creating models desgined for Framework's Open Model format. This format
 * is an extension of regular JSON models and allows models to be designed outside of
 * the 3x3x3 limit and removes the 22.5 rotation step. Exported models will only
 * work in game if using the custom loader added by Framework. This will not work in vanilla.
 *
 * Codec based on original java_block format.
 * https://github.com/JannisX11/blockbench/blob/master/js/io/formats/java_block.js
 */
function FrameworkOpenModelCodec() {
	let item_parents = [
		'item/generated', 	'minecraft:item/generated',
		'item/handheld', 	'minecraft:item/handheld',
		'item/handheld_rod','minecraft:item/handheld_rod',
		'builtin/generated','minecraft:builtin/generated',
	]
	var openModelCodec = new Codec('framework_open_model', {
		name: 'Framework Open Model',
		remember: false,
		extension: 'json',
		load_filter: {
			type: 'json',
			extensions: ['json'],
			condition(model) {
				return model.parent || model.elements || model.textures;
			}
		},
		compile(options) {
			if (options === undefined) options = {}
			var clear_elements = []
			var textures_used = []
			var element_index_lut = []

			function computeCube(s) {
				if (s.export == false) return;
				//Create Element
				var element = {}
				element_index_lut[Cube.all.indexOf(s)] = clear_elements.length

				if (settings.framework_open_model_export_cube_names == true && !settings.minifiedout.value) {
					if (s.name !== 'cube') {
						element.name = s.name
					}
				}
				element.from = s.from.slice();
				element.to = s.to.slice();
				if (s.inflate) {
					for (var i = 0; i < 3; i++) {
						element.from[i] -= s.inflate;
						element.to[i] += s.inflate;
					}
				}
				if (s.shade === false) {
					element.shade = false
				}
				if (!s.rotation.allEqual(0) || !s.origin.allEqual(0)) {
					var axis = s.rotationAxis() || 'y';
					element.rotation = new oneLiner({
						angle: s.rotation[getAxisNumber(axis)],
						axis,
						origin: s.origin
					})
				}
				if (s.rescale) {
					if (element.rotation) {
						element.rotation.rescale = true
					} else {
						element.rotation = new oneLiner({
							angle: 0,
							axis: s.rotation_axis || 'y',
							origin: s.origin,
							rescale: true
						})
					}

				}
				if (s.rotation.positiveItems() >= 2) {
					element.rotated = s.rotation
				}
				var element_has_texture
				var e_faces = {}
				for (var face in s.faces) {
					if (s.faces.hasOwnProperty(face)) {
						if (s.faces[face].texture !== null) {
							var tag = new oneLiner()
							if (s.faces[face].enabled !== false) {
								tag.uv = s.faces[face].uv.slice();
								tag.uv.forEach((n, i) => {
									tag.uv[i] = n * 16 / UVEditor.getResolution(i % 2);
								})
							}
							if (s.faces[face].rotation) {
								tag.rotation = s.faces[face].rotation
							}
							if (s.faces[face].texture) {
								var tex = s.faces[face].getTexture()
								if (tex) {
									let name = PathModule.parse(tex.name).name
									tag.texture = '#' + name
									textures_used.safePush(tex)
								}
								element_has_texture = true
							}
							if (!tag.texture) {
								tag.texture = '#missing'
							}
							if (s.faces[face].cullface) {
								tag.cullface = s.faces[face].cullface
							}
							if (s.faces[face].tint >= 0) {
								tag.tintindex = s.faces[face].tint
							}
							e_faces[face] = tag
						}
					}
				}
				//Gather Textures
				if (!element_has_texture) {
					element.color = s.color
				}
				element.faces = e_faces

				if (Object.keys(element.faces).length) {
					clear_elements.push(element)
				}
			}

			function iterate(arr) {
				var i = 0;
				if (!arr || !arr.length) {
					return;
				}
				for (i = 0; i < arr.length; i++) {
					if (arr[i].type === 'cube') {
						computeCube(arr[i])
					} else if (arr[i].type === 'group') {
						iterate(arr[i].children)
					}
				}
			}
			iterate(Outliner.root)

			function checkExport(key, condition) {
				key = options[key]
				if (key === undefined) {
					return condition;
				} else {
					return key
				}
			}
			var isTexturesOnlyModel = clear_elements.length === 0 && checkExport('parent', Project.parent != '')
			var texturesObj = {}
			Texture.all.forEach(function(t, i) {
				var link = t.javaTextureLink()
				if (t.particle) {
					texturesObj.particle = link
				}
				if (!textures_used.includes(t) && !isTexturesOnlyModel) 
					return;

				let name = PathModule.parse(t.name).name
				if (name !== link.replace(/^#/, '')) {
					texturesObj[name] = link
				}
			})

			if (options.prevent_dialog !== true && clear_elements.length && item_parents.includes(Project.parent)) {
				Blockbench.showMessageBox({
					translateKey: 'invalid_builtin_parent',
					icon: 'info',
					message: tl('message.invalid_builtin_parent.message', [Project.parent])
				})
				Project.parent = '';
			}

			var blockmodel = {}
			if (checkExport('comment', settings.credit.value)) {
				blockmodel.credit = settings.credit.value
			}
			blockmodel.loader = 'framework:open_model'
			if (checkExport('parent', Project.parent != '')) {
				blockmodel.parent = Project.parent
			}
			if (checkExport('ambientocclusion', Project.ambientocclusion === false)) {
				blockmodel.ambientocclusion = false
			}
			if (Project.texture_width !== 16 || Project.texture_height !== 16) {
				blockmodel.texture_size = [Project.texture_width, Project.texture_height]
			}
			if (checkExport('textures', Object.keys(texturesObj).length >= 1)) {
				blockmodel.textures = texturesObj
			}
			if (checkExport('elements', clear_elements.length >= 1)) {
				blockmodel.components = clear_elements
			}
			if (checkExport('front_gui_light', Project.front_gui_light)) {
				blockmodel.gui_light = 'front';
			}
			if (checkExport('overrides', Project.overrides)) {
				blockmodel.overrides = Project.overrides;
			}
			if (checkExport('display', Object.keys(Project.display_settings).length >= 1)) {
				var new_display = {}
				var entries = 0;
				for (var i in DisplayMode.slots) {
					var key = DisplayMode.slots[i]
					if (DisplayMode.slots.hasOwnProperty(i) && Project.display_settings[key] && Project.display_settings[key].export) {
						new_display[key] = Project.display_settings[key].export()
						entries++;
					}
				}
				if (entries) {
					blockmodel.display = new_display
				}
			}
			if (checkExport('groups', (settings.export_groups.value && Group.all.length))) {
				groups = compileGroups(false, element_index_lut)
				var i = 0;
				while (i < groups.length) {
					if (typeof groups[i] === 'object') {
						i = Infinity
					}
					i++
				}
				if (i === Infinity) {
					blockmodel.groups = groups
				}
			}
			this.dispatchEvent('compile', {
				model: blockmodel,
				options
			});
			if (options.raw) {
				return blockmodel
			} else {
				return autoStringify(blockmodel)
			}
		}
	});

	var format = new ModelFormat({
		id: 'framework_open_model',
		extension: 'json',
		icon: 'fa-layer-group',
		category: 'minecraft',
		target: 'Minecraft: Java Edition',
		rotate_cubes: true,
		canvas_limit: false,
		rotation_limit: true,
		rotation_snap: false,
		optional_box_uv: true,
		uv_rotation: true,
		animated_textures: true,
		display_mode: true,
		texture_folder: true,
		java_face_properties: true,
		codec: openModelCodec,
		format_page: {
			content: [
				{type: 'h3', text: tl('mode.start.format.informations')},
				{text: `* ${tl('format.framework_open_model.info.rotation')}
						* ${tl('format.framework_open_model.info.size')}
						* ${tl('format.framework_open_model.info.loader')}`.replace(/\t+/g, '')
				}
			]
		},
	})

	// Hook to enable tinting in Tint Preview plugin
	format.allowTinting = true; 

	// Allows this format to be used for Vehicle Mod Toolbox plugin
	format.vehicle_toolbox = true;
	
	openModelCodec.format = format;

	return openModelCodec;
}