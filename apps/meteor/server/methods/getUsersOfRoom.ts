import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import type { IRoom, IUser } from '@rocket.chat/core-typings';

import { Rooms, Subscriptions } from '../../app/models/server';
import { canAccessRoomAsync, roomAccessAttributes } from '../../app/authorization/server';
import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';
import { findUsersOfRoom } from '../lib/findUsersOfRoom';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		getUsersOfRoom(
			rid: IRoom['_id'],
			showAll?: boolean,
			options?: { limit?: number; skip?: number },
			filter?: string,
		): {
			total: number;
			records: IUser[];
		};
	}
}

Meteor.methods<ServerMethods>({
	async getUsersOfRoom(rid, showAll, { limit, skip } = {}, filter) {
		if (!rid) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', { method: 'getUsersOfRoom' });
		}

		check(rid, String);

		const userId = Meteor.userId();
		if (!userId) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', { method: 'getUsersOfRoom' });
		}

		const room = Rooms.findOneById(rid, { fields: { ...roomAccessAttributes, broadcast: 1 } });
		if (!room) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', { method: 'getUsersOfRoom' });
		}

		if (!(await canAccessRoomAsync(room, { _id: userId }))) {
			throw new Meteor.Error('not-authorized', 'Not Authorized', { method: 'getUsersOfRoom' });
		}

		if (room.broadcast && !(await hasPermissionAsync(userId, 'view-broadcast-member-list', rid))) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', { method: 'getUsersOfRoom' });
		}

		// TODO this is currently counting deactivated users
		const total = Subscriptions.findByRoomIdWhenUsernameExists(rid).count();

		const { cursor } = findUsersOfRoom({
			rid,
			status: !showAll ? { $ne: 'offline' } : undefined,
			limit,
			skip,
			filter,
		});

		return {
			total,
			records: await cursor.toArray(),
		};
	},
});
