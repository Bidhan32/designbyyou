/*
=========================================================
FashionVision AI
Vector Utilities
=========================================================
*/

export function create(x = 0, y = 0) {
    return { x, y };
}

export function clone(v) {
    return {
        x: v.x,
        y: v.y
    };
}

export function add(a, b) {
    return {
        x: a.x + b.x,
        y: a.y + b.y
    };
}

export function subtract(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

export function multiply(v, scalar) {
    return {
        x: v.x * scalar,
        y: v.y * scalar
    };
}

export function divide(v, scalar) {
    return {
        x: v.x / scalar,
        y: v.y / scalar
    };
}

export function magnitude(v) {
    return Math.hypot(v.x, v.y);
}

export function normalize(v) {

    const mag = magnitude(v);

    if (mag === 0)
        return create(0,0);

    return divide(v, mag);
}

export function distance(a,b){
    return Math.hypot(
        b.x-a.x,
        b.y-a.y
    );
}

export function dot(a,b){

    return a.x*b.x+a.y*b.y;

}

export function cross(a,b){

    return a.x*b.y-a.y*b.x;

}

export function angle(a,b){

    const d=dot(a,b);

    const m=magnitude(a)*magnitude(b);

    if(m===0) return 0;

    return Math.acos(
        Math.max(-1,
        Math.min(1,d/m))
    );

}

export function midpoint(a,b){

    return{

        x:(a.x+b.x)/2,

        y:(a.y+b.y)/2

    };

}

export function lerp(a,b,t){

    return{

        x:a.x+(b.x-a.x)*t,

        y:a.y+(b.y-a.y)*t

    };

}

export function equals(a,b,eps=0.0001){

    return(

        Math.abs(a.x-b.x)<eps &&

        Math.abs(a.y-b.y)<eps

    );

}

export function rotate(v,radians){

    const cos=Math.cos(radians);

    const sin=Math.sin(radians);

    return{

        x:v.x*cos-v.y*sin,

        y:v.x*sin+v.y*cos

    };

}

export function perpendicular(v){

    return{

        x:-v.y,

        y:v.x

    };

}

export function average(points){

    if(points.length===0)

        return create();

    let x=0;

    let y=0;

    points.forEach(p=>{

        x+=p.x;

        y+=p.y;

    });

    return{

        x:x/points.length,

        y:y/points.length

    };

}