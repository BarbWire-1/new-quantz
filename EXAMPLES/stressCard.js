/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */

import { QElement } from "../src/QuantzCore/element.js"
import { html, createComponent } from "../src/QuantzCore/factory.js"


import { autoScrollToBottom, autoScroll } from "../src/plugins/scroll.js";


export const stressComponent = createComponent(
	'stresstest-component',
	class StresstestComponent extends QElement {
	// Simply declare fields on 'this'. No state wrappers or .reactive properties!
			arr = ['a', 'b'];
obj = { num: 42, self: null };
			color = 'crimson';
			colors = ['red', 'green'];
			blah = 'BLAH';
			user = {
				profile: { name: 'John Doe', id: null },
			};

		shuffleData() {
			// Array methods trigger updates perfectly through the Proxy layer
			this.colors.reverse();
		}

		runInnerCalculations() {
			const helperFunction = () => {
				// Inner functions change data natively
				this.user.profile.name = 'Max Mustermann';
				this.user.profile.id = 999;
			};
			helperFunction();
		}

		async simulateFetch() {
			function getRandomInt(max) {
				return Math.floor(Math.random() * max);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
			// Async assignments are batched via queueMicrotask
			this.user.profile.name = 'Fetched User';
			this.user.profile.id = getRandomInt(3000);
			this.colors.splice(2, 0, StresstestComponent.randomColor());
		}
		static randomColor() {
			return '#' + Math.floor(Math.random() * 16777215).toString(16);
		}

		static test(c) {
			return `Active wrapper: ${c.toUpperCase()}`;
		}
		addNewColor(newColor) {
			// Weil Arrays über den rekursiven Proxy laufen, triggert auch das
			// Hinzufügen von Elementen automatisch das minimale DOM-Update!
			this.colors.push(StresstestComponent.randomColor());
		}

		template() {
			const newDate = new Date();
			const vis = () => {
				console.log("RUNNING VIS" ,isNaN(this.obj.self?.self?.num))
				return isNaN(this.obj.self?.self?.num) ? 'hidden' : 'visible';
			}
			return html`

				<h3 style="color: magenta">
					User: ${this.user.profile.name} (ID:
					${this.user.profile.id})
				</h3>
				<p obj selfreference:>this.obj.self: ${this.obj.self}</p>
					<p style="visibility: ${vis()}"> obj selfreference:>this.obj.self?.self?.num: ${this.obj.self?.self?.num}</p>
				<!-- .prevent verhindert z.B. das Neuladen der Seite bei einem Formular -->
				<form @submit.prevent="${e => this.addNewColor()}">
					<button type="submit">Absenden</button>
				</form>
				<p>this.none?.existing?.prop: ${this.none?.existing?.prop}</p>
				<p>new Date(): ${newDate}</p>
				<button onclick="${() =>this.addNewColor()}">Add Item</button>
				<button onclick="${() => this.colors.pop()}">Pop Item</button>
				<button onclick="${() => this.shuffleData()}">
					Reverse Array
				</button>
				<button onclick="${() => this.runInnerCalculations()}">
					Set User
				</button>
				<!-- onfocus , but does not check for key what????-->
				<button @keyDown(a)="${e => this.addNewColor()}">
					Add Item 'a'
				</button>
				<button onclick="${() => this.simulateFetch()}">
					Fetch User (1s,at [2])
				</button>
				<h4>Global EventDelegation</h4>
				<button @click="${this.addNewColor}">Add Item</button>
				<button @click="${this.colors.pop}">Pop Item</button>
				<button @click="${this.shuffleData}">
					Reverse Array
				</button>

			<div style="height:200px;
			width: calc(100% - 40px);
			margin: 20px;


background-color:gray;
color: black;


			 overflow-y: auto"
			use=${autoScroll()}
>
				<p style="padding: 20px" >Array this.colors:${this.colors}</p>
</div>
				<p>this.color: ${this.color}</p>
				<ul>
					<li
						style="color: ${this.blah === 'NÖ' ? this.color : 'pink'}"
					>
						TERNARY: ${StresstestComponent.test(this.color)}
					</li>
					<li
						style="font-family: arial; font-weight: bolder; color: ${this.colors.at(-1)}"
					>
						My color is the last in list: ${this.colors.at(-1)},
						current user.ID: ${this.user.profile.id}
					</li>
					<h4 style="margin: 10px">ListContainer</h4>
					<div
						id="out"
						style="height: 150px; max-height: 200px; background-color: gray; overflow-y: auto;  padding: 5px"
						use="${autoScrollToBottom()}"
					>
						${this.colors.map(
							c => html`
								<li style="font-family: monospace; color: ${c}">
									My color is ${c}, current user.ID:
									${this.user.profile.id}
								</li>
							`
						)}
					</div>

							${this.arr.map(v => html`<p>${v}</p>`)}

				</ul>

			`;
		}
	}
);

const createStressTest = () => {
	for (let i = 0; i <100; i++) {
		const t = document.createElement('stresstest-component');
		document.getElementById('app').appendChild(t);
	}
	const one = document.querySelector('stresstest-component');
	// Dynamically alter system states after 2 seconds to prove full reactivity loop integrity
	setTimeout(() => {
		one.color = 'purple';
		one.num = 100;
		one.colors = ['orange', 'teal', 'darkblue'];
		one.blah = 'NÖ';

		one.obj.self = 'value';

		one.obj.self = one.obj;
	}, 12000);
};
//createStressTest();
