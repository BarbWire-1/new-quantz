/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// TODO - list is rendered nested li in li per item!!!!!
//import './style.css';

// import * as Q from 'quantz';
// import {autoScroll, autoScrollToBottom} from 'quantz/plugins/scroll'
import { QElement } from '../src/QuantzCore/element.js';
import { html, createComponent } from '../src/QuantzCore/factory.js';

import { autoScrollToBottom, autoScroll } from '../src/plugins/scroll.js';
import { stressComponent } from './stressCard.js';
import { UserCard } from './userCard.js';


// const card = document.createElement('user-card')
//  document.getElementById('app').appendChild(card);


//  card.updateData(5)
// setTimeout(() => {
// 	card.users.reverse();
// }, 5000);

const createStressTest = () => {
	for (let i = 0; i < 1; i++) {
		const t = document.createElement('stresstest-component');
		document.getElementById('app').appendChild(t);
	}
	const one = document.querySelector('stresstest-component');
	// Dynamically alter system states after 2 seconds to prove full reactivity loop integrity
	setTimeout(() => {
		one.color = 'purple';
		one.num = 100;
		one.colors = [ 'orange', 'teal', 'darkblue' ];
		one.blah = 'NÖ';



		one.obj.self = "value"

		one.obj.self = one.obj;



	}, 12000);
}
createStressTest()
