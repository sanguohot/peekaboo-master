
var utils = require('utils');
var net = require('net');
var consts = require('consts');

var input_sequence_number = 0;
var direction = {x:0, y:0};// 方向

var indicatorDir;

/**
 * 角色控制器 - 找
 * 主要是接收键盘事件
 */
cc.Class({
    extends: cc.Component,

    properties: {
    },

    onLoad: function () {
        this.roleClass = this.node.getComponent('binRole');
    },

    init: function(){
        direction = {x:0, y:0};
        this.indicatorPos = 0; // 指示器方向的位置
        this.status = 0; // 0.闲置 1.行走
        this.pendingInputs = [];
        this.roleClass.entity.isShowIndicator(true);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    },

    stopAllEvent: function() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    },

    onMouseDown: function (event) {
        if(this.roleClass.entity.bulletIsEmpty())
            return;// 子弹空了 就直接返回
        if(!this.roleClass.entity.isCanFire)
            return;// 换弹中
        var startPos = {x: this.node.x, y: this.node.y};
        var targetPos = {x: this.indicatorPos.x, y: this.indicatorPos.y};
        net.send('connector.gameHandler.applyFire', {startPos: startPos, targetPos: targetPos});
    },

    onMouseMove: function (event) {
        this.indicatorPos = event.getLocation();
    },

    onKeyDown: function(event){
        this.status = 1;
        this.move(event, 1);
    },
    onKeyUp: function(event){
        this.move(event, 0);
    },
    move: function(event, speed){
        switch(event.keyCode) {
            case cc.KEY.a:
            case cc.KEY.left: // 左
                direction.x = -1 * speed;
                break;
            case cc.KEY.d:
            case cc.KEY.right:// 右
                direction.x = 1 * speed;
                break;
            case cc.KEY.w:
            case cc.KEY.up: // 上
                direction.y = 1 * speed;
                break;
            case cc.KEY.s:
            case cc.KEY.down:// 下
                direction.y = -1 * speed;
                break;
        }
    },

    // 服务器调和
    serverReconciliation: function (lastSequenceNumber) {
        var i = 0;
        while (i < this.pendingInputs.length) {
            var input = this.pendingInputs[i];
            if (input.sequenceNumber <= lastSequenceNumber) {
                this.pendingInputs.splice(i, 1);
            } else {
                this.roleClass.applyMove(input.pressTime);
                i++;
            }
        }
    },

    update: function(dt){
        // 刷新指示器
        indicatorDir = 90 - utils.rotation(this.node.position, this.indicatorPos);
        this.roleClass.entity.updateIndicator(indicatorDir);

        if(this.roleClass.isPlayFireAnim)
            return;
        // 发送位置信息
        if(this.status === 0)
            return;
        var new_dt = dt;
        if(direction.x === 0 && direction.y === 0){
            this.status = 0;
            this.roleClass.playAnim('role_idle');
        } else {
            this.roleClass.playAnim('role_run');
            var arf = Math.abs(Math.abs(direction.x) - Math.abs(direction.y));
            if(arf === 0){// 这里说明要斜着走
                new_dt = dt * 0.7071;// Math.sin( Math.atan(dt/dt) ) = 0.7071067811865475;
            }
            // var x = Math.abs(direction.x*dt);
            // var y = Math.abs(direction.y*dt);
            // var l1 = cc.pLength(cc.p(x, y));
            // var l2 = cc.pLength(cc.p(0, dt));
            // var r = l2 / l1;
            // new_dt = r * dt;
        }

        var pressTime = this.roleClass.isCanMove({x: direction.x*new_dt, y: direction.y*new_dt});

        var input = {
            status: this.status,
            pressTime: pressTime,
            sequenceNumber: ++input_sequence_number,
        };

        net.send('connector.gameHandler.processInputs', {input: input});

        // 客户端预测
        this.roleClass.applyMove(input.pressTime);

        // 记录每次的操作指令 方便后面做调和
        this.pendingInputs.push(input);
    }

});
