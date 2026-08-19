import { fireEvent } from "@testing-library/react";

/**
 * dnd-kit のドラッグ&ドロップをテストするための擬似レイアウト。
 *
 * jsdom はレイアウトエンジンを持たないため `getBoundingClientRect()` が常に
 * 0 の矩形を返す。dnd-kit は矩形計算だけで並び替え先を決めるため、素のままでは
 * ドラッグが成立せず「壊れていても壊れていなくてもテストが通らない」状態になる。
 * ここでは要素へ明示的に矩形を割り当て、未指定の要素は子孫の和集合を返すことで
 * ブロック要素の実挙動を近似する。
 */

/** 擬似レイアウトで割り当てる矩形。 */
export interface TestRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

const ZERO_RECT: TestRect = { top: 0, left: 0, width: 0, height: 0 };

function toDomRect(rect: TestRect): DOMRect {
	const { top, left, width, height } = rect;
	const value = {
		top,
		left,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
	};
	return { ...value, toJSON: () => value } as DOMRect;
}

function unionRect(a: TestRect, b: TestRect): TestRect {
	const top = Math.min(a.top, b.top);
	const left = Math.min(a.left, b.left);
	const bottom = Math.max(a.top + a.height, b.top + b.height);
	const right = Math.max(a.left + a.width, b.left + b.width);
	return { top, left, width: right - left, height: bottom - top };
}

export interface TestLayout {
	/** 要素へ矩形を割り当てる。 */
	setRect(element: Element, rect: TestRect): void;
	/**
	 * 縦並びのリストとして要素へ順に矩形を割り当て、割り当てた矩形を返す。
	 */
	stackVertically(
		elements: Element[],
		options?: {
			top?: number;
			left?: number;
			width?: number;
			height?: number;
			gap?: number;
		},
	): TestRect[];
	/** `getBoundingClientRect()` のモックを解除する。 */
	restore(): void;
}

/**
 * `Element.prototype.getBoundingClientRect` を擬似レイアウトへ差し替える。
 * テストの `afterEach` などで必ず `restore()` を呼ぶこと。
 */
export function installTestLayout(): TestLayout {
	const rects = new WeakMap<Element, TestRect>();
	const original = Element.prototype.getBoundingClientRect;

	Element.prototype.getBoundingClientRect = function measure(
		this: Element,
	): DOMRect {
		const own = rects.get(this);
		if (own) {
			return toDomRect(own);
		}

		// 未指定の要素は、内包する登録済み要素の和集合を返す。
		// これにより一覧コンテナは全行を含む矩形、1 行だけを包む wrapper は
		// その行と同じ矩形になり、ブラウザ上のレイアウトと同じ関係が再現される。
		let union: TestRect | null = null;
		for (const descendant of this.querySelectorAll("*")) {
			const rect = rects.get(descendant);
			if (!rect) continue;
			union = union ? unionRect(union, rect) : rect;
		}

		return toDomRect(union ?? ZERO_RECT);
	};

	return {
		setRect(element, rect) {
			rects.set(element, rect);
		},
		stackVertically(elements, options = {}) {
			const { top = 0, left = 0, width = 600, height = 60, gap = 8 } = options;
			return elements.map((element, index) => {
				const rect: TestRect = {
					top: top + index * (height + gap),
					left,
					width,
					height,
				};
				rects.set(element, rect);
				return rect;
			});
		},
		restore() {
			Element.prototype.getBoundingClientRect = original;
		},
	};
}

/** 矩形の縦方向の中心座標。 */
export function centerY(rect: TestRect): number {
	return rect.top + rect.height / 2;
}

/**
 * PointerSensor 経由で縦方向のドラッグ&ドロップを再現する。
 *
 * `activationConstraint.distance` を超えるまでドラッグは開始されないため、
 * 開始判定用の移動を 1 度挟んでから目的地へ移動する。
 */
export function dragVertically(
	handle: Element,
	options: { from: number; to: number; startX?: number },
): void {
	const { from, to, startX = 0 } = options;
	const direction = to >= from ? 1 : -1;

	fireEvent.pointerDown(handle, {
		isPrimary: true,
		button: 0,
		clientX: startX,
		clientY: from,
	});
	// activationConstraint (distance: 8) を超えさせてドラッグを開始する。
	fireEvent.pointerMove(document, {
		clientX: startX,
		clientY: from + direction * 12,
	});
	fireEvent.pointerMove(document, { clientX: startX, clientY: to });
	fireEvent.pointerUp(document, { clientX: startX, clientY: to });
}
